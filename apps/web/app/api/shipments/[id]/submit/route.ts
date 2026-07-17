import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import type { CarrierOffer } from "@oco/core/carrier-adapter/types";
import {
  YandexAuthError,
  confirmOffer,
} from "@oco/core/carrier-adapter/yandex/client";
import { withAuth } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";
import { getCarrierCredentials } from "@/lib/shipments/get-carrier-credentials";
import { submitOrder } from "@/lib/shipments/submit-order";

function isCarrierOffer(value: unknown): value is CarrierOffer {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const o = value as Record<string, unknown>;
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
      },
    });

    if (!row) {
      return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    }

    const offer = findQuotedOffer(row.quotedOffers, offerIdRaw);
    if (!offer) {
      return NextResponse.json(
        { error: "Запросите тарифы заново" },
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

      const result = await submitOrder(prisma, {
        shipmentId: row.id,
        companyId: user.companyId,
        offer,
        credentials: credsResult.credentials,
        confirm: confirmOffer,
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
      if (error instanceof YandexAuthError) {
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
