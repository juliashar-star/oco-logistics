import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { listOffersForOrderAdapters } from "@oco/core/carrier-adapter/list-offers-for-order-adapters";
import {
  ORDER_ADAPTERS,
  resolveOrderAdapter,
} from "@oco/core/carrier-adapter/order-adapters";
import { providerSellerDisplayName } from "@oco/core/carrier-adapter/provider-seller-display-names";
import { selectOrderAdaptersForConnectedCarriers } from "@oco/core/carrier-adapter/select-order-adapters-for-connected-carriers";
import { narrowAdaptersToPointCarrier } from "@oco/core/carrier-adapter/narrow-adapters-to-point-carrier";
import { withAuth } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";
import { decryptShipmentRecipientPii } from "@/lib/recipient-pii";
import { buildOfferInput } from "@/lib/shipments/build-offer-input";
import { listConnectedCarriers } from "@/lib/shipments/list-connected-carriers";
import { toOffersResponse } from "@/lib/shipments/offer-dto";

function resolveOfferServiceTitle(adapterKey: string | undefined): string {
  return resolveOrderAdapter(adapterKey).title;
}

function resolveOfferSupportsThermalBag(
  adapterKey: string | undefined,
): boolean {
  return resolveOrderAdapter(adapterKey).supportsThermalBag === true;
}

function resolveOfferCarrierName(adapterKey: string | undefined): string {
  return (
    providerSellerDisplayName(resolveOrderAdapter(adapterKey).providerKey) ??
    ""
  );
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
        needsThermalBag: true,
        handoverMode: true,
        pvzCode: true,
        pvzProviderKey: true,
        destCity: true,
        destAddress: true,
        destApartment: true,
        deliveryComment: true,
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

    try {
      const connected = await listConnectedCarriers(prisma, user.companyId);
      const selected = selectOrderAdaptersForConnectedCarriers(
        Object.values(ORDER_ADAPTERS),
        connected,
      );
      if (selected.length === 0) {
        return NextResponse.json(
          {
            error:
              "Подключите перевозчика в настройках, чтобы рассчитать доставку",
          },
          { status: 400 },
        );
      }

      // PVZ only: quote through the network that owns the chosen point.
      // Door destinations are not narrowed. null/empty pvzProviderKey leaves
      // the connected list intact (legacy drafts predate the column).
      const forOffers =
        row.pickupType === "PVZ"
          ? narrowAdaptersToPointCarrier(selected, row.pvzProviderKey)
          : selected;
      const pointCarrierKey =
        typeof row.pvzProviderKey === "string" ? row.pvzProviderKey.trim() : "";
      if (
        row.pickupType === "PVZ" &&
        pointCarrierKey !== "" &&
        forOffers.length === 0
      ) {
        return NextResponse.json(
          {
            error:
              "Выбранный пункт принадлежит перевозчику, который не подключён. Выберите другой пункт выдачи.",
          },
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
          needsThermalBag: decrypted.needsThermalBag,
          handoverMode: decrypted.handoverMode,
          pvzCode: decrypted.pvzCode,
          destCity: decrypted.destCity,
          destAddress: decrypted.destAddress,
          destApartment: decrypted.destApartment,
          deliveryComment: decrypted.deliveryComment,
          recipientName: decrypted.recipientName,
          recipientPhone: decrypted.recipientPhone,
        },
        company,
        providerKey: forOffers[0].adapter.providerKey,
      });

      if (!built.ok) {
        return NextResponse.json(
          {
            error: messageForBuildFailure(built.reason, decrypted.pickupType),
          },
          { status: 400 },
        );
      }

      // Tagging happens inside the service (adapterKey = registry entry key).
      // Client DTO keeps adapterKey off the wire; serviceTitle is resolved here.
      const { offers: taggedOffers, adapters } = await listOffersForOrderAdapters(
        built.input,
        forOffers,
      );

      if (
        taggedOffers.length > 0 ||
        adapters.some((entry) => entry.status === "ok")
      ) {
        // CarrierOffer.rawOffer is `unknown`; Prisma.InputJsonValue rejects it
        // without a cast. Same pattern as persist-tariff-quotes (as InputJsonValue).
        const quotedOffers = taggedOffers as unknown as Prisma.InputJsonValue;
        await prisma.shipment.update({
          where: { id: row.id },
          data: { quotedOffers },
        });
        return NextResponse.json(
          toOffersResponse(
            { ok: true, offers: taggedOffers },
            resolveOfferServiceTitle,
            resolveOfferSupportsThermalBag,
            resolveOfferCarrierName,
          ),
        );
      }

      if (
        adapters.length > 0 &&
        adapters.every((entry) => entry.status === "no_delivery_options")
      ) {
        const quotedOffers = [] as unknown as Prisma.InputJsonValue;
        await prisma.shipment.update({
          where: { id: row.id },
          data: { quotedOffers },
        });
        return NextResponse.json(
          toOffersResponse(
            { ok: false, reason: "no_delivery_options" },
            resolveOfferServiceTitle,
            resolveOfferSupportsThermalBag,
            resolveOfferCarrierName,
          ),
        );
      }

      if (
        adapters.length > 0 &&
        adapters.every((entry) => entry.status === "auth_failed")
      ) {
        return NextResponse.json(
          {
            error:
              "Не удалось авторизоваться у перевозчика. Проверьте подключение в настройках.",
          },
          { status: 400 },
        );
      }

      // Never forward error.message to the client — getOffers interpolates the
      // provider raw body. Service no longer rethrows; log statuses only.
      console.error("[shipments/offers] no offers", adapters);
      return NextResponse.json(
        { error: "Не удалось получить тарифы. Попробуйте позже." },
        { status: 500 },
      );
    } catch (error) {
      // Decrypt / build-input / credentials / Prisma — service never rethrows.
      // Error object is logged deliberately and never reaches the client.
      console.error("[shipments/offers] request failed", error);
      return NextResponse.json(
        { error: "Не удалось получить тарифы. Попробуйте позже." },
        { status: 500 },
      );
    }
  },
  { requireEmailVerified: true },
);
