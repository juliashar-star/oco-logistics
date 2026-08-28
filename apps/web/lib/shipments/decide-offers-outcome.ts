/**
 * What the offers route answers once the fan-out has returned.
 *
 * WHY THIS IS NOT IN THE ROUTE. It is a decision — which of four answers the
 * seller gets — and a decision inside a route is one nothing can prove: route
 * tests here need auth, Prisma and Next together, so they are not written, and
 * the branch set silently rotted the moment a fifth adapter status existed.
 * That is not hypothetical: `parcel_too_large` was added to the fan-out, no
 * branch knew it, and a seller whose parcel was merely too large fell through
 * every case to HTTP 500 «Попробуйте позже» — an error for a thing that had not
 * failed, advising a retry that could never help.
 *
 * Pure, so every combination is reachable in milliseconds.
 */

/** Statuses the fan-out can report for one adapter. */
export type AdapterOutcomeStatus = string;

export type OffersOutcome =
  /** Serve the list, with the per-adapter notice beside it. */
  | "offers"
  /** Nobody had anything to sell, and nothing broke. */
  | "no_delivery_options"
  /** Every adapter refused our credentials — the seller can fix this. */
  | "auth_failed"
  /**
   * No list, and the reason lies with the carriers rather than with us: at
   * least one did not answer, and every status we got is one we understand.
   * The seller is told WHICH carrier said WHAT and that recalculating is worth
   * a try — see describeAdaptersWithoutOffers. Added 28.08.2026.
   */
  | "carriers_unreachable"
  /** OUR fault: nothing was asked, or a status nothing here recognises. */
  | "server_error";

/**
 * Statuses that mean «this service answered and has nothing for you, and
 * nothing went wrong».
 *
 * `parcel_too_large` belongs here with `no_delivery_options` because to the
 * route they are the same kind of event: a service that will not carry THIS
 * order, for a reason that is not a fault of ours or the carrier's. They differ
 * only in what the seller is told, and that difference is the notice line's job
 * (describeAdaptersWithoutOffers), not this function's.
 */
const NOTHING_TO_SELL: ReadonlySet<string> = new Set([
  "no_delivery_options",
  "parcel_too_large",
]);

/**
 * Statuses whose cause lies OUTSIDE our code. An allow-list on purpose, not
 * `!== "ok"`: a sixth status must still fall through to `server_error` rather
 * than be swept into a statement, which is exactly the trap `parcel_too_large`
 * fell into and the reason this module exists.
 */
const CARRIER_SIDE: ReadonlySet<string> = new Set([
  "failed",
  "timed_out",
  "no_delivery_options",
  "parcel_too_large",
  "auth_failed",
]);

/**
 * MIXED FAULTS NO LONGER COLLAPSE TO A SERVER ERROR — reversed 28.08.2026, and
 * the earlier reasoning is worth keeping because only half of it failed.
 *
 * What was right: aggregating a mixed set into «нет вариантов» is a claim we
 * cannot back. When one carrier is silent, whether the seller has options is
 * unknown, and it stays unknown.
 *
 * What was wrong: the conclusion drawn from it. Answering `server_error` does
 * not avoid a claim — it makes a different one, «попробуйте позже», which
 * asserts a retry will help. Measured 28.08: CDEK edu returned HTTP 500 as the
 * only connected adapter and the seller was told exactly that, with no carrier
 * named. The same sentence answers a fault in OUR code, where the advice is
 * false. One sentence for two opposite causes is not caution, it is silence.
 *
 * `carriers_unreachable` aggregates NOTHING. It hands the per-adapter statuses
 * to the browser, which names each carrier and what it said — «не отвечает»
 * beside «не возит по этому направлению» — so a mixed set is reported exactly as
 * mixed, and no sentence claims the seller has no options.
 *
 * `server_error` now means only what it says: nothing was asked, or a status
 * nothing here recognises. Both are ours.
 */
export function decideOffersOutcome(args: {
  hasOffers: boolean;
  statuses: readonly AdapterOutcomeStatus[];
}): OffersOutcome {
  const { hasOffers, statuses } = args;

  if (hasOffers || statuses.includes("ok")) {
    return "offers";
  }
  // Nothing was asked at all — the fan-out returned no entries. Ours.
  if (statuses.length === 0) {
    return "server_error";
  }
  // The two homogeneous collapses keep precedence: each has its own screen and
  // its own advice, and both are more specific than «the carriers are down».
  if (statuses.every((status) => NOTHING_TO_SELL.has(status))) {
    return "no_delivery_options";
  }
  if (statuses.every((status) => status === "auth_failed")) {
    return "auth_failed";
  }
  if (statuses.every((status) => CARRIER_SIDE.has(status))) {
    return "carriers_unreachable";
  }
  return "server_error";
}
