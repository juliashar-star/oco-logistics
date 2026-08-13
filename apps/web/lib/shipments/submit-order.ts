import type { PrismaClient } from "@prisma/client";
import {
  CarrierAuthError,
  CarrierOfferExpiredError,
  CarrierQuoteChangedError,
} from "@oco/core/carrier-adapter/errors";
import type {
  CarrierConfirmResult,
  CarrierConfirmWarning,
  CarrierCreateOrderInput,
  CarrierCredentials,
  CarrierOffer,
} from "@oco/core/carrier-adapter/types";

import { parseOptionalIsoDate } from "../date/parse-optional-iso-date";
import { captureForSubmit } from "./capture-for-submit";
import { deriveOperatorRequestId } from "./operator-request-id";

/** Injected confirm — production passes Yandex `confirmOffer`; tests stub it. */
export type ConfirmOfferFn = (
  offer: CarrierOffer,
  input: CarrierCreateOrderInput,
  credentials: CarrierCredentials,
) => Promise<CarrierConfirmResult>;

export type SubmitOrderArgs = {
  shipmentId: string;
  companyId: string;
  offer: CarrierOffer;
  /** Same shape getOffers received — rebuilt per request, never persisted here. */
  input: CarrierCreateOrderInput;
  credentials: CarrierCredentials;
  confirm: ConfirmOfferFn;
  /** Credential / Shipment.providerKey for the adapter that confirmed. */
  providerKey: string;
  /** ORDER_ADAPTERS key written to Shipment.orderAdapterKey on CREATED. */
  orderAdapterKey: string;
};

export type SubmitOrderResult =
  | {
      ok: true;
      requestId: string;
      status: "CREATED";
      providerKey: string;
      orderAdapterKey: string;
      warnings: CarrierConfirmWarning[];
    }
  | { ok: false; stage: "capture"; reason: "not_found" | "not_draft" }
  | {
      ok: false;
      stage: "confirm";
      reason: "quote_changed" | "offer_expired" | "auth" | "unknown";
    }
  | { ok: false; stage: "write-after-confirm"; requestId: string };

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
  const {
    shipmentId,
    companyId,
    offer,
    input,
    credentials,
    confirm,
    providerKey,
    orderAdapterKey,
  } = args;

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
  let warnings: CarrierConfirmWarning[] = [];

  try {
    try {
      const confirmed = await confirm(offer, input, credentials);
      requestId = confirmed.requestId;
      warnings = confirmed.warnings;
    } catch (error) {
      if (error instanceof CarrierQuoteChangedError) {
        await prisma.shipment.updateMany({
          where: { id: shipmentId, companyId },
          data: { status: "DRAFT", submittingAt: null },
        });
        return { ok: false, stage: "confirm", reason: "quote_changed" };
      }
      if (error instanceof CarrierOfferExpiredError) {
        await prisma.shipment.updateMany({
          where: { id: shipmentId, companyId },
          data: { status: "DRAFT", submittingAt: null },
        });
        return { ok: false, stage: "confirm", reason: "offer_expired" };
      }
      if (error instanceof CarrierAuthError) {
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
      // Calendar-day carriers (e.g. CDEK) send blank intervals and no offer
      // expiry. Invalid Date must never reach Prisma: this write runs AFTER
      // the carrier order exists, so a failed parse would orphan a live order.
      // deliveryDayFrom/deliveryDayTo stay on the offer only — inventing a
      // clock time to store a calendar day as DateTime is what the offer card
      // refuses to do; leave plannedDeliveryDate null when intervals are blank.
      await prisma.shipment.updateMany({
        where: { id: shipmentId, companyId },
        data: {
          status: "CREATED",
          providerOrderId: requestId,
          plannedDeliveryDate: parseOptionalIsoDate(offer.deliveryIntervalFrom),
          plannedDeliveryDateTo: parseOptionalIsoDate(offer.deliveryIntervalTo),
          providerKey,
          orderAdapterKey,
          selectedOfferId: offer.offerId,
          // The carrier's own name for what was bought (CDEK: tariff_name,
          // e.g. «Посылка склад-склад»). THE VALUE WAS ALREADY IN HAND HERE and
          // was simply dropped: the row kept the offer id but nothing naming the
          // service, so the list fell back to the registry title — right for
          // Yandex, wrong for every CDEK order.
          // Blank or whitespace becomes null, never "": Yandex sends no name at
          // all, and «no value» must have ONE representation, not two.
          selectedOfferServiceName: offer.serviceName?.trim() || null,
          selectedOfferExpiresAt: parseOptionalIsoDate(offer.expiresAt),
          // plannedCost is kopecks (docs/DATABASE.md; every reader divides by 100);
          // CarrierOffer.priceRub is rubles — raw would show 273.28 ₽ as 2,73 ₽.
          // plannedDeliveryDays left null: Yandex gives a date, not a day count.
          plannedCost: Math.round(offer.priceRub * 100),
          // Neutral codes only — never provider message text (may echo PII).
          confirmWarnings: warnings,
        },
      });
      return {
        ok: true,
        requestId,
        status: "CREATED",
        providerKey,
        orderAdapterKey,
        warnings,
      };
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
