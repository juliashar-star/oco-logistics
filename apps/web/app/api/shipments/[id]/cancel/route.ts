import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import {
  YandexAuthError,
  cancelOrder,
} from "@oco/core/carrier-adapter/yandex/client";
import { withAuth } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";
import { getCarrierCredentials } from "@/lib/shipments/get-carrier-credentials";

const TERMINAL_STATUSES = ["DELIVERED", "RETURNED", "CANCELED"] as const;

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
        providerOrderId: true,
      },
    });

    if (!row) {
      return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    }

    // Precondition is not a status list — the real question is whether we hold
    // an order id at the carrier at all.
    if (row.providerOrderId == null || row.providerOrderId.trim() === "") {
      return NextResponse.json(
        { error: "Заказ ещё не создан у перевозчика" },
        { status: 400 },
      );
    }

    if (
      (TERMINAL_STATUSES as readonly string[]).includes(row.status)
    ) {
      return NextResponse.json(
        { error: "Заказ уже завершён" },
        { status: 409 },
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

      const cancelResult = await cancelOrder(
        row.providerOrderId,
        credsResult.credentials,
      );

      if (!cancelResult.ok) {
        // Carrier not recognising an id we hold is OUR inconsistency, not
        // evidence about the order — do not change the row's status.
        console.error(
          "[shipments/cancel] ORDER_NOT_FOUND",
          JSON.stringify({
            shipmentId: row.id,
            providerOrderId: row.providerOrderId,
          }),
        );
        return NextResponse.json(
          {
            error:
              "Перевозчик не знает этот заказ. Мы уже разбираемся.",
          },
          { status: 500 },
        );
      }

      const { result } = cancelResult;

      // DO NOT write status CANCELED (or any status). Cancellation does not
      // cancel — accepted means only that Yandex took the request; the order
      // may still be delivered and nothing in this API will ever tell us
      // which happened. Writing CANCELED would be exactly the lie
      // CarrierCancelResult was reshaped to prevent.

      // Record a TrackingEvent in Yandex's own words — invent no code of ours.
      // Safe against sync: mapYandexStatusToShipmentStatus returns null for
      // "cancellation_started", so the sync's "last non-null mapped wins" rule
      // skips it and the shipment status stays untouched.
      // Two presses SHOULD produce two events — the seller really did ask
      // twice, at two different moments, and that is the truth the timeline
      // should show. (findUnique/upsert on eventAt=new Date() was dead: the
      // key is always fresh, unlike sync where eventAt comes from Yandex.)
      const statusCode = result.reason ?? result.providerStatus;
      const statusText =
        result.description ?? result.reason ?? result.providerStatus;
      await prisma.trackingEvent.create({
        data: {
          shipmentId: row.id,
          statusCode,
          statusText,
          eventAt: new Date(),
          rawResponse: result as unknown as Prisma.InputJsonValue,
        },
      });

      return NextResponse.json({
        ok: true,
        accepted: result.accepted,
        providerStatus: result.providerStatus,
        reason: result.reason,
      });
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
      // Never forward error.message — cancelOrder may interpolate provider raw text.
      console.error("[shipments/cancel] cancelOrder failed", error);
      return NextResponse.json(
        { error: "Не удалось отменить заказ. Попробуйте позже." },
        { status: 500 },
      );
    }
  },
  { requireEmailVerified: true },
);
