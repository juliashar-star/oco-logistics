import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { CarrierAuthError } from "@oco/core/carrier-adapter/errors";
import { resolveOrderAdapterStrict } from "@oco/core/carrier-adapter/order-adapters";
import { withAuth } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";
import { resolveCancelTrackingEvent } from "@/lib/shipments/cancel-tracking-event";
import {
  carrierAuthErrorMessage,
  carrierNotConnectedMessage,
} from "@/lib/shipments/carrier-connection-messages";
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
        orderAdapterKey: true,
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

    // STRICT on purpose — the defaulting resolveOrderAdapter is wrong here.
    // A row with a null or unrecognised orderAdapterKey cannot be attributed to
    // a carrier, and defaulting would send the cancel to Yandex for an order
    // that may live at another provider. Refuse instead: nothing is written and
    // no carrier is called on this branch.
    const orderAdapter = resolveOrderAdapterStrict(row.orderAdapterKey);
    if (orderAdapter === null) {
      console.error(
        "[shipments/cancel] UNRESOLVABLE_ORDER_ADAPTER",
        JSON.stringify({
          shipmentId: row.id,
          orderAdapterKey: row.orderAdapterKey,
        }),
      );
      return NextResponse.json(
        {
          error:
            "Не удалось определить перевозчика по этому отправлению — отмена через ОСО недоступна.",
        },
        { status: 409 },
      );
    }

    try {
      const credsResult = await getCarrierCredentials(
        prisma,
        user.companyId,
        orderAdapter.providerKey,
      );
      if (!credsResult.ok) {
        return NextResponse.json(
          { error: carrierNotConnectedMessage(orderAdapter.providerKey) },
          { status: 400 },
        );
      }

      const cancelResult = await orderAdapter.cancelOrder(
        row.providerOrderId,
        credsResult.credentials,
      );

      if (!cancelResult.ok) {
        // EXPLICIT CHAIN, not a fallthrough. NOTHING IS WRITTEN on any branch
        // here and no carrier is called again: the adapter already learned what
        // is possible and stopped. A TrackingEvent would record our own refusal
        // as if it were something the carrier reported about the parcel.
        const { reason } = cancelResult;

        if (reason === "order_not_found") {
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

        if (reason === "cancel_not_free") {
          return NextResponse.json(
            {
              error:
                "Бесплатно отменить этот заказ уже нельзя. Дальнейшая отмена возможна только на стороне перевозчика и будет платной.",
            },
            { status: 409 },
          );
        }

        if (reason === "cancel_unavailable") {
          return NextResponse.json(
            {
              error:
                "Этот заказ уже нельзя отменить — обратитесь в поддержку перевозчика.",
            },
            { status: 409 },
          );
        }

        // UNREACHABLE TODAY, and that is the point. Adding a member to
        // CarrierCancelOrderResult without handling it here breaks the build on
        // this line instead of letting the new reason inherit whichever branch
        // happened to sit last. Proven by temporarily adding a fourth member
        // and watching typecheck fail — do not delete this to silence an error;
        // add the branch the compiler is asking for.
        const _exhaustive: never = reason;
        console.error(
          "[shipments/cancel] UNHANDLED_CANCEL_REASON",
          JSON.stringify({
            shipmentId: row.id,
            reason: _exhaustive,
          }),
        );
        return NextResponse.json(
          { error: "Не удалось отменить заказ. Попробуйте позже." },
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
      //
      // The resolution moved out to a pure function so it can be unit-tested;
      // null means the carrier gave us nothing nameable and there is no event
      // worth writing. The cancellation still SUCCEEDED — only our record of it
      // is missing — so the seller gets the same response either way.
      const event = resolveCancelTrackingEvent(result);
      if (event === null) {
        console.error(
          "[shipments/cancel] NO_TRACKING_EVENT_CODE",
          JSON.stringify({ shipmentId: row.id }),
        );
      } else {
        await prisma.trackingEvent.create({
          data: {
            shipmentId: row.id,
            statusCode: event.statusCode,
            statusText: event.statusText,
            eventAt: new Date(),
            rawResponse: result as unknown as Prisma.InputJsonValue,
          },
        });
      }

      return NextResponse.json({
        ok: true,
        accepted: result.accepted,
        providerStatus: result.providerStatus,
        reason: result.reason,
      });
    } catch (error) {
      if (error instanceof CarrierAuthError) {
        // Named from the adapter we actually called: CarrierAuthError is the
        // base of both YandexAuthError and CdekAuthError, so a hardcoded name
        // told half the sellers to check a connection they do not have.
        return NextResponse.json(
          { error: carrierAuthErrorMessage(orderAdapter.providerKey) },
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
