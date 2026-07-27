import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { CarrierAuthError } from "@oco/core/carrier-adapter/errors";
import { resolveOrderAdapter } from "@oco/core/carrier-adapter/order-adapters";
import type { CarrierOffer } from "@oco/core/carrier-adapter/types";
import { withAuth } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";
import { decryptShipmentRecipientPii } from "@/lib/recipient-pii";
import { buildOfferInput } from "@/lib/shipments/build-offer-input";
import { getCarrierCredentials } from "@/lib/shipments/get-carrier-credentials";
import { submitOrder } from "@/lib/shipments/submit-order";

function isCarrierOffer(value: unknown): value is CarrierOffer {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const o = value as Record<string, unknown>;
  if (
    "adapterKey" in o &&
    o.adapterKey !== undefined &&
    typeof o.adapterKey !== "string"
  ) {
    return false;
  }
  return (
    typeof o.offerId === "string" &&
    typeof o.expiresAt === "string" &&
    typeof o.deliveryIntervalFrom === "string" &&
    typeof o.deliveryIntervalTo === "string" &&
    typeof o.pickupIntervalFrom === "string" &&
    typeof o.pickupIntervalTo === "string" &&
    typeof o.priceRub === "number"
  );
}

/** Narrow Prisma JsonValue → stored CarrierOffer by offerId (structural check, no any). */
function findQuotedOffer(
  quotedOffers: Prisma.JsonValue,
  offerId: string,
): CarrierOffer | null {
  if (!Array.isArray(quotedOffers)) {
    return null;
  }
  for (const item of quotedOffers) {
    if (isCarrierOffer(item) && item.offerId === offerId) {
      return item;
    }
  }
  return null;
}

function messageForBuildFailure(
  reason:
    | "no_declared_value"
    | "no_sender"
    | "no_sender_phone"
    | "no_idempotency_key"
    | "no_destination",
  pickupType: "PVZ" | "COURIER",
): string {
  switch (reason) {
    case "no_declared_value":
      return "Укажите объявленную ценность отправления";
    case "no_sender":
      return "Укажите город отправления в настройках компании";
    case "no_sender_phone":
      return "Укажите телефон отправителя в настройках";
    case "no_idempotency_key":
      return "Этот заказ создан старым способом и не может быть оформлен через прямого перевозчика";
    case "no_destination":
      return pickupType === "PVZ"
        ? "Выберите пункт выдачи"
        : "Укажите адрес доставки";
  }
}

export const POST = withAuth<{ id: string }>(
  async (request, user, { params }) => {
    const { id } = await params;
    const shipmentId = id.trim();
    if (!shipmentId) {
      return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Выберите вариант доставки" },
        { status: 400 },
      );
    }

    const offerIdRaw =
      body !== null &&
      typeof body === "object" &&
      "offerId" in body &&
      typeof (body as { offerId: unknown }).offerId === "string"
        ? (body as { offerId: string }).offerId.trim()
        : "";
    if (!offerIdRaw) {
      return NextResponse.json(
        { error: "Выберите вариант доставки" },
        { status: 400 },
      );
    }

    const row = await prisma.shipment.findFirst({
      where: {
        id: shipmentId,
        companyId: user.companyId,
      },
      select: {
        id: true,
        quotedOffers: true,
        companyId: true,
        idempotencyKey: true,
        declaredValue: true,
        weightG: true,
        lengthCm: true,
        widthCm: true,
        heightCm: true,
        pickupType: true,
        pvzCode: true,
        destCity: true,
        destAddress: true,
        destApartment: true,
        deliveryComment: true,
        recipientName: true,
        recipientPhone: true,
        isAnonymized: true,
      },
    });

    if (!row) {
      return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    }

    if (row.isAnonymized) {
      return NextResponse.json(
        { error: "Данные получателя удалены, заказ нельзя оформить" },
        { status: 409 },
      );
    }

    const offer = findQuotedOffer(row.quotedOffers, offerIdRaw);
    if (!offer) {
      return NextResponse.json(
        { error: "Запросите тарифы заново" },
        { status: 400 },
      );
    }

    const orderAdapter = resolveOrderAdapter(offer.adapterKey);

    try {
      const credsResult = await getCarrierCredentials(
        prisma,
        user.companyId,
        orderAdapter.providerKey,
      );
      if (!credsResult.ok) {
        return NextResponse.json(
          { error: "Яндекс Доставка не подключена" },
          { status: 400 },
        );
      }

      // Decrypt only after credentials succeed — missing carrier must not touch PII.
      const decrypted = decryptShipmentRecipientPii(row);

      const company = await prisma.company.findFirst({
        where: { id: user.companyId },
        select: {
          name: true,
          inn: true,
          contactEmail: true,
          senderCity: true,
          senderAddress: true,
          senderPhone: true,
        },
      });

      if (!company) {
        console.error(
          "[shipments/submit] company not found for authenticated session",
          user.companyId,
        );
        return NextResponse.json(
          { error: "Не удалось оформить заказ. Мы уже разбираемся." },
          { status: 500 },
        );
      }

      const built = buildOfferInput({
        shipment: {
          companyId: decrypted.companyId,
          idempotencyKey: decrypted.idempotencyKey,
          declaredValue: decrypted.declaredValue,
          weightG: decrypted.weightG,
          lengthCm: decrypted.lengthCm,
          widthCm: decrypted.widthCm,
          heightCm: decrypted.heightCm,
          pickupType: decrypted.pickupType,
          pvzCode: decrypted.pvzCode,
          destCity: decrypted.destCity,
          destAddress: decrypted.destAddress,
          destApartment: decrypted.destApartment,
          deliveryComment: decrypted.deliveryComment,
          recipientName: decrypted.recipientName,
          recipientPhone: decrypted.recipientPhone,
        },
        company,
        providerKey: orderAdapter.providerKey,
      });

      if (!built.ok) {
        return NextResponse.json(
          {
            error: messageForBuildFailure(built.reason, decrypted.pickupType),
          },
          { status: 400 },
        );
      }

      const result = await submitOrder(prisma, {
        shipmentId: row.id,
        companyId: user.companyId,
        offer,
        input: built.input,
        credentials: credsResult.credentials,
        confirm: orderAdapter.confirmOffer,
        providerKey: orderAdapter.providerKey,
        orderAdapterKey: orderAdapter.key,
      });

      if (result.ok) {
        return NextResponse.json({ ok: true, requestId: result.requestId });
      }

      if (result.stage === "capture") {
        if (result.reason === "not_found") {
          return NextResponse.json(
            { error: "Заказ не найден" },
            { status: 404 },
          );
        }
        return NextResponse.json(
          { error: "Заказ уже отправляется или отправлен" },
          { status: 409 },
        );
      }

      if (result.stage === "confirm") {
        if (result.reason === "quote_changed") {
          // submitOrder already returned the row to DRAFT — re-quoting works.
          return NextResponse.json(
            {
              error:
                "Цена у перевозчика изменилась. Запросите тарифы заново.",
            },
            { status: 409 },
          );
        }
        if (result.reason === "offer_expired") {
          // submitOrder already returned the row to DRAFT — re-quoting works.
          return NextResponse.json(
            {
              error:
                "Срок действия варианта истёк. Запросите тарифы заново.",
            },
            { status: 409 },
          );
        }
        if (result.reason === "auth") {
          return NextResponse.json(
            {
              error:
                "Не удалось авторизоваться в Яндекс Доставке. Проверьте подключение.",
            },
            { status: 400 },
          );
        }
        return NextResponse.json(
          { error: "Не удалось оформить заказ. Мы уже разбираемся." },
          { status: 500 },
        );
      }

      // write-after-confirm: order EXISTS at Yandex; only our persist failed.
      // "Не удалось создать заказ" would lie — the whole path exists to avoid that.
      return NextResponse.json(
        {
          error:
            "Заказ создан у перевозчика, но не сохранился у нас. Мы уже разбираемся.",
          requestId: result.requestId,
        },
        { status: 500 },
      );
    } catch (error) {
      if (error instanceof CarrierAuthError) {
        return NextResponse.json(
          {
            error:
              "Не удалось авторизоваться в Яндекс Доставке. Проверьте подключение.",
          },
          { status: 400 },
        );
      }
      // Never forward error.message — provider raw text may be in it.
      console.error("[shipments/submit] submitOrder failed", error);
      return NextResponse.json(
        { error: "Не удалось оформить заказ. Мы уже разбираемся." },
        { status: 500 },
      );
    }
  },
  { requireEmailVerified: true },
);
