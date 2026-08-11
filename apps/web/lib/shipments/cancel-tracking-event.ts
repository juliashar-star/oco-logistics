import type { CarrierCancelResult } from "@oco/core/carrier-adapter/types";

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
 */
export function resolveCancelTrackingEvent(
  result: CarrierCancelResult,
): CancelTrackingEventFields | null {
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
