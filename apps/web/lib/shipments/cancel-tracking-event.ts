import { OCO_CANCEL_ALREADY_REQUESTED } from "@oco/core/carrier-adapter/cancel-event-codes";
import type { CarrierCancelResult } from "@oco/core/carrier-adapter/types";

/**
 * Reasons that mean «ОСО deliberately sent the carrier NOTHING».
 *
 * AN EXPLICIT LIST, never a prefix or a name pattern. OCO_CANCEL_REQUESTED is
 * also namespaced OCO_*, and it means the opposite — we did ask. A rule keyed on
 * the shape of the string would swallow it and leave a real cancellation with no
 * record at all.
 *
 * Exactly one member today: cancelCdekOrder returns OCO_CANCEL_ALREADY_REQUESTED
 * when requests[] already carries a queued DELETE, and returns it WITHOUT
 * issuing a second one (cdek/client.ts, the pendingDelete branch — the test
 * there asserts the DELETE is never sent). Add a member here only for a reason
 * that likewise reports «we made no request», and add the test with it.
 */
const NOTHING_WAS_SENT_REASONS = new Set<string>([OCO_CANCEL_ALREADY_REQUESTED]);

/**
 * Did the adapter tell us it made no request at all?
 *
 * EXISTS FOR THE LOG, NOT FOR THE DECISION. resolveCancelTrackingEvent returns
 * a bare null for two unrelated situations — «the carrier gave us nothing
 * nameable», which is a fault, and «we deliberately sent nothing», which is
 * routine — and the route has to tell them apart to log them differently. It
 * reads the same set as the resolver, so the two can never drift into disagreeing
 * about which reasons mean «not sent».
 *
 * `unknown` because the caller is handing over a value off a result object; a
 * missing or non-string reason is simply not one of ours.
 */
export function isCancelNotSentReason(reason: unknown): boolean {
  return typeof reason === "string" && NOTHING_WAS_SENT_REASONS.has(reason.trim());
}

/** The two text columns of a TrackingEvent. eventAt and rawResponse are the
 *  caller's business — they need a clock and the raw body, and this stays pure. */
export type CancelTrackingEventFields = {
  statusCode: string;
  statusText: string;
};

/**
 * Decide what a cancellation should record in the seller's timeline, or that it
 * should record NOTHING.
 *
 * Pure so the decision is provable: the cancel route needs auth, Prisma and
 * Next to run, which puts it out of reach of a unit test, and a rule nothing can
 * exercise is a rule nobody is watching.
 *
 * The precedence is unchanged from what the route did inline: the provider's own
 * `reason` names the event best when it exists ("cancellation_started"), the
 * status is the honest fallback, and `description` is preferred for the human
 * text because carriers supply it ready-made.
 *
 * RETURNS null WHEN THERE IS NO CODE TO RECORD. An event with an empty
 * statusCode is not evidence of anything — it is a blank line in a timeline, and
 * nothing downstream would reject it: the composite unique is
 * (shipmentId, statusCode, eventAt), so "" is a perfectly storable value and the
 * row would persist looking like data.
 *
 * THIS GUARDS EVERY CARRIER, NOT ONE BRANCH. Yandex Express reaches it today
 * when the post-cancel claims/info read fails and providerStatus is "" by
 * design, but any future adapter that returns a CarrierCancelResult carrying no
 * reason and no status lands here too. Do not narrow this back to Express.
 *
 * IT ALSO RETURNS null WHEN NOTHING WAS SENT, AND THAT null MEANS SOMETHING
 * DIFFERENT. The case above is «the carrier gave us nothing nameable» — an event
 * happened and we cannot label it. This one is «there is nothing to record,
 * because there was no event»: the adapter looked, saw the seller's earlier
 * cancellation still queued at the carrier, and deliberately made no request.
 * A timeline entry there would report an approach to the carrier that never
 * took place, once per press — two identical rows for two presses, ten for ten.
 * The first, real cancellation already left its row; what the seller needs now
 * is the reason, and the banner gives it (cancelRequestNoticeMessage).
 */
export function resolveCancelTrackingEvent(
  result: CarrierCancelResult,
): CancelTrackingEventFields | null {
  // Keyed on the reason WE set, not on providerStatus: the skip is a fact about
  // what ОСО did, and providerStatus is the carrier's word for the queued
  // request ("ACCEPTED", "WAITING") — a vocabulary that says nothing about
  // whether we called.
  if (NOTHING_WAS_SENT_REASONS.has((result.reason ?? "").trim())) {
    return null;
  }

  const statusCode = (result.reason ?? result.providerStatus).trim();
  if (!statusCode) {
    return null;
  }

  const statusText = (
    result.description ??
    result.reason ??
    result.providerStatus
  ).trim();

  // statusText is non-nullable in the schema. A code with blank text is still
  // worth recording — fall back to the code rather than storing "".
  return { statusCode, statusText: statusText || statusCode };
}
