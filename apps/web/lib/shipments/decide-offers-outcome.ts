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
  /** Genuinely unexpected: something failed, or failures were mixed. */
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
 * MIXED FAULTS STAY A SERVER ERROR, deliberately and unchanged. When one
 * adapter is unreachable and another has nothing, we do not know whether the
 * seller has no options or simply did not get an answer, and saying «нет
 * вариантов» would be a claim we cannot back. Only a set that is entirely
 * fault-free, or entirely one fault, collapses to a statement.
 */
export function decideOffersOutcome(args: {
  hasOffers: boolean;
  statuses: readonly AdapterOutcomeStatus[];
}): OffersOutcome {
  const { hasOffers, statuses } = args;

  if (hasOffers || statuses.includes("ok")) {
    return "offers";
  }
  if (statuses.length === 0) {
    return "server_error";
  }
  if (statuses.every((status) => NOTHING_TO_SELL.has(status))) {
    return "no_delivery_options";
  }
  if (statuses.every((status) => status === "auth_failed")) {
    return "auth_failed";
  }
  return "server_error";
}
