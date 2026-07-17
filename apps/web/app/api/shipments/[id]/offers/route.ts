import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { YandexAuthError, getOffers } from "@oco/core/carrier-adapter/yandex/client";
import { withAuth } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";
import { decryptShipmentRecipientPii } from "@/lib/recipient-pii";
import { buildYandexOfferInput } from "@/lib/shipments/build-yandex-offer-input";
import { getCarrierCredentials } from "@/lib/shipments/get-carrier-credentials";
import { toOffersResponse } from "@/lib/shipments/offer-dto";

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
      // Sender fields live on the company settings form — name that place.
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
  async (_request, user, { params }) => {
    const { id } = await params;
    const shipmentId = id.trim();
    if (!shipmentId) {
      return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    }

    const row = await prisma.shipment.findFirst({
      where: {
        id: shipmentId,
        companyId: user.companyId,
      },
      select: {
        id: true,
        status: true,
        isAnonymized: true,
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
        recipientName: true,
        recipientPhone: true,
      },
    });

    if (!row) {
      return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    }

    if (row.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Для этого заказа тарифы уже запрошены или он отправлен" },
        { status: 409 },
      );
    }

    if (row.isAnonymized) {
      return NextResponse.json(
        { error: "Данные получателя удалены, заказ нельзя оформить" },
        { status: 409 },
      );
    }

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
      // Session holds a companyId with no row — our inconsistency, not the
      // seller's missing order.
      console.error(
        "[shipments/offers] company not found for authenticated session",
        user.companyId,
      );
      return NextResponse.json(
        { error: "Не удалось получить тарифы. Попробуйте позже." },
        { status: 500 },
      );
    }

    const built = buildYandexOfferInput({
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
        recipientName: decrypted.recipientName,
        recipientPhone: decrypted.recipientPhone,
      },
      company,
    });

    if (!built.ok) {
      return NextResponse.json(
        {
          error: messageForBuildFailure(built.reason, decrypted.pickupType),
        },
        { status: 400 },
      );
    }

    try {
      const credsResult = await getCarrierCredentials(
        prisma,
        user.companyId,
        "yataxi",
      );
      if (!credsResult.ok) {
        return NextResponse.json(
          { error: "Яндекс Доставка не подключена" },
          { status: 400 },
        );
      }

      const offersResult = await getOffers(
        built.input,
        credsResult.credentials,
      );

      // CarrierOffer.rawOffer is `unknown`; Prisma.InputJsonValue rejects it
      // without a cast. Same pattern as persist-tariff-quotes (as InputJsonValue).
      const quotedOffers = (
        offersResult.ok ? offersResult.offers : []
      ) as unknown as Prisma.InputJsonValue;

      await prisma.shipment.update({
        where: { id: row.id },
        data: { quotedOffers },
      });

      return NextResponse.json(toOffersResponse(offersResult));
    } catch (error) {
      if (error instanceof YandexAuthError) {
        return NextResponse.json(
          {
            error:
              "Не удалось авторизоваться в Яндекс Доставке. Проверьте подключение.",
          },
          { status: 400 },
        );
      }
      // Never forward error.message — getOffers interpolates the provider raw body.
      console.error("[shipments/offers] getOffers failed", error);
      return NextResponse.json(
        { error: "Не удалось получить тарифы. Попробуйте позже." },
        { status: 500 },
      );
    }
  },
  { requireEmailVerified: true },
);
