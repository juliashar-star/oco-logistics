import type { PrismaClient, SelectionMode } from "@prisma/client";
import { buildShipmentDecision } from "@oco/core/shipment-decision";

/**
 * Writes the decision record for a shipment that has just been submitted.
 *
 * THE ORDER MATTERS MORE THAN THE REPORT, and that is the whole design of this
 * module. It is called AFTER the carrier order already exists, so anything it
 * throws would turn a successful order into a failed request and leave the
 * seller believing nothing was sent. It therefore never throws — not for a
 * malformed offers blob, not for a Prisma error, not for a unique-constraint
 * collision. Every failure is logged and swallowed.
 *
 * The cost of that choice is named here rather than discovered later: shipments
 * with NO decision row are possible and expected. There is no transaction
 * around submit, so a crash between the carrier order and this write leaves a
 * shipment without a decision. Any report built on this table must COUNT those
 * rows, not silently drop them — see docs/DECISION_RECORD.md.
 */

const LOG_SKIPPED = "[recordShipmentDecision] SKIPPED";
const LOG_WRITE_FAILED = "[recordShipmentDecision] WRITE_FAILED";

export type RecordShipmentDecisionArgs = {
  shipmentId: string;
  /** Shipment.quotedOffers, as read from the database. Any shape. */
  offers: unknown;
  selectedOfferId: unknown;
  selectionMode: SelectionMode | null;
  rulesVersion: number;
  now: Date;
};

export type RecordShipmentDecisionResult =
  | { written: true }
  | { written: false; reason: string };

/**
 * `YYYY-MM-DD` → a Date for a `@db.Date` column, pinned to UTC midnight.
 *
 * Explicit `T00:00:00.000Z` rather than bare `new Date("2026-09-03")`: the bare
 * form is only specified to be UTC for the date-only form, and being explicit
 * costs nothing while removing the question. The column stores a calendar day,
 * so the time component is discarded on the way in — what must not happen is a
 * LOCAL midnight being sent, which in Moscow would be 21:00 the previous day
 * and could store the wrong date.
 */
function calendarDay(day: string | null): Date | null {
  if (day === null) {
    return null;
  }
  const parsed = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function recordShipmentDecision(
  prisma: PrismaClient,
  args: RecordShipmentDecisionArgs,
): Promise<RecordShipmentDecisionResult> {
  try {
    const built = buildShipmentDecision({
      offers: args.offers,
      selectedOfferId: args.selectedOfferId,
      rulesVersion: args.rulesVersion,
      now: args.now,
    });

    if (!built.ok) {
      // Not an error condition worth alarming about on its own — an old draft
      // whose offers predate adapterKey lands here legitimately. Logged so a
      // RISE in these is visible, since it would mean the offers blob changed
      // shape under us.
      console.error(LOG_SKIPPED, {
        shipmentId: args.shipmentId,
        reason: built.reason,
      });
      return { written: false, reason: built.reason };
    }

    const d = built.decision;

    // CREATE, NOT UPSERT, and the choice is deliberate. The record is a
    // snapshot of one moment; an upsert would silently rewrite what the seller
    // was shown, which is the one thing this table exists to prevent. A
    // collision on the unique shipmentId means a decision already exists, and
    // that is information — it must surface as a log line, not be resolved
    // away. It is unreachable through the route today: captureForSubmit is a
    // compare-and-swap on status='DRAFT', so a shipment already CREATED cannot
    // be submitted a second time.
    await prisma.shipmentDecision.create({
      data: {
        shipmentId: args.shipmentId,
        rulesVersion: d.rulesVersion,
        decidedAt: d.decidedAt,
        selectionMode: args.selectionMode,
        chosenAdapterKey: d.chosenAdapterKey,
        chosenServiceName: d.chosenServiceName,
        chosenPriceKop: d.chosenPriceKop,
        chosenPriceIsEstimate: d.chosenPriceIsEstimate,
        chosenDeadlineDay: calendarDay(d.chosenDeadlineDay),
        chosenDeadlineBasis: d.chosenDeadlineBasis,
        altAdapterKey: d.altAdapterKey,
        altPriceKop: d.altPriceKop,
        altPriceIsEstimate: d.altPriceIsEstimate,
        altDeadlineDay: calendarDay(d.altDeadlineDay),
        offersTotal: d.offersTotal,
        carriersTotal: d.carriersTotal,
        attributionComplete: d.attributionComplete,
      },
    });

    return { written: true };
  } catch (error) {
    // NEVER a provider body and never the offers blob: the first can echo the
    // recipient's fields and the second carries the whole quote. Only a
    // code-like string reaches the log.
    console.error(LOG_WRITE_FAILED, {
      shipmentId: args.shipmentId,
      error: error instanceof Error ? error.name : "unknown",
    });
    return { written: false, reason: "write_failed" };
  }
}
