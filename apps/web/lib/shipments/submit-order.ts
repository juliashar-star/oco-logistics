import type { PrismaClient } from "@prisma/client";
import type {
  CarrierConfirmResult,
  CarrierCredentials,
  CarrierOffer,
} from "@oco/core/carrier-adapter/types";
import {
  YandexAuthError,
  YandexOfferExpiredError,
} from "@oco/core/carrier-adapter/yandex/client";

import { captureForSubmit } from "./capture-for-submit";
import { deriveOperatorRequestId } from "./operator-request-id";

/** Injected confirm — production passes Yandex `confirmOffer`; tests stub it. */
export type ConfirmOfferFn = (
  offerId: string,
  credentials: CarrierCredentials,
) => Promise<CarrierConfirmResult>;

export type SubmitOrderArgs = {
  shipmentId: string;
  companyId: string;
  offer: CarrierOffer;
  credentials: CarrierCredentials;
  confirm: ConfirmOfferFn;
};

export type SubmitOrderResult =
  | { ok: true; requestId: string }
  | { ok: false; stage: "capture"; reason: "not_found" | "not_draft" }
  | {
      ok: false;
      stage: "confirm";
      reason: "offer_expired" | "auth" | "unknown";
    }
  | { ok: false; stage: "write-after-confirm"; requestId: string };

const PROVIDER_KEY_YANDEX = "yataxi";

const WRITE_AFTER_CONFIRM_LOG_MARKER =
  "[submitOrder] WRITE_AFTER_CONFIRM_BOTH_FAILED";
const FINALLY_NET_READ_FAILED = "[submitOrder] FINALLY_NET_READ_FAILED";
const FINALLY_NET_STILL_SUBMITTING =
  "[submitOrder] FINALLY_NET_STILL_SUBMITTING";

/**
 * Offers-flow order path: claim DRAFT → confirm offer → persist CREATED.
 *
 * Hard invariant: after a successful capture the row always ends in DRAFT,
 * CREATED, or PROBLEM — never left in SUBMITTING. Enforced by a finally net
 * that forces PROBLEM if the row is somehow still SUBMITTING.
 *
 * `operatorRequestId` is derivable from (companyId, shipment.idempotencyKey);
 * there is no Shipment column for it, so we only compute it for reaper logs.
 */
export async function submitOrder(
  prisma: PrismaClient,
  args: SubmitOrderArgs,
): Promise<SubmitOrderResult> {
  const { shipmentId, companyId, offer, credentials, confirm } = args;

  const capture = await captureForSubmit(prisma, shipmentId, companyId);
  if (!capture.captured) {
    return { ok: false, stage: "capture", reason: capture.reason };
  }

  const row = await prisma.shipment.findFirst({
    where: { id: shipmentId, companyId },
    select: { idempotencyKey: true },
  });
  const operatorRequestId =
    row?.idempotencyKey != null && row.idempotencyKey !== ""
      ? deriveOperatorRequestId(companyId, row.idempotencyKey)
      : null;

  let requestId: string | undefined;

  try {
    try {
      const confirmed = await confirm(offer.offerId, credentials);
      requestId = confirmed.requestId;
    } catch (error) {
      if (error instanceof YandexOfferExpiredError) {
        await prisma.shipment.updateMany({
          where: { id: shipmentId, companyId },
          data: { status: "DRAFT", submittingAt: null },
        });
        return { ok: false, stage: "confirm", reason: "offer_expired" };
      }
      if (error instanceof YandexAuthError) {
        await prisma.shipment.updateMany({
          where: { id: shipmentId, companyId },
          data: { status: "PROBLEM" },
        });
        return { ok: false, stage: "confirm", reason: "auth" };
      }
      await prisma.shipment.updateMany({
        where: { id: shipmentId, companyId },
        data: { status: "PROBLEM" },
      });
      return { ok: false, stage: "confirm", reason: "unknown" };
    }

    try {
      await prisma.shipment.updateMany({
        where: { id: shipmentId, companyId },
        data: {
          status: "CREATED",
          providerOrderId: requestId,
          plannedDeliveryDate: new Date(offer.deliveryIntervalFrom),
          providerKey: PROVIDER_KEY_YANDEX,
          selectedOfferId: offer.offerId,
          selectedOfferExpiresAt: new Date(offer.expiresAt),
          // plannedCost is kopecks (docs/DATABASE.md; every reader divides by 100);
          // CarrierOffer.priceRub is rubles — raw would show 273.28 ₽ as 2,73 ₽.
          // plannedDeliveryDays left null: Yandex gives a date, not a day count.
          plannedCost: Math.round(offer.priceRub * 100),
        },
      });
      return { ok: true, requestId };
    } catch {
      try {
        await prisma.shipment.updateMany({
          where: { id: shipmentId, companyId },
          data: { status: "PROBLEM", providerOrderId: requestId },
        });
      } catch {
        console.error(
          WRITE_AFTER_CONFIRM_LOG_MARKER,
          JSON.stringify({
            requestId,
            operatorRequestId,
            shipmentId,
            companyId,
          }),
        );
      }
      return { ok: false, stage: "write-after-confirm", requestId };
    }
  } finally {
    // Last-resort net: never rethrow, never change try's return/throw.
    try {
      const current = await prisma.shipment.findFirst({
        where: { id: shipmentId, companyId },
        select: { status: true },
      });
      if (!current || current.status !== "SUBMITTING") {
        // Missing row or already terminal — do not blind-write.
      } else {
        try {
          await prisma.shipment.updateMany({
            where: { id: shipmentId, companyId },
            data: {
              status: "PROBLEM",
              ...(requestId != null ? { providerOrderId: requestId } : {}),
            },
          });
        } catch {
          console.error(
            FINALLY_NET_STILL_SUBMITTING,
            JSON.stringify({
              shipmentId,
              companyId,
              operatorRequestId,
              ...(requestId != null ? { requestId } : {}),
            }),
          );
        }
      }
    } catch {
      console.error(
        FINALLY_NET_READ_FAILED,
        JSON.stringify({
          shipmentId,
          companyId,
          operatorRequestId,
          ...(requestId != null ? { requestId } : {}),
        }),
      );
    }
  }
}
