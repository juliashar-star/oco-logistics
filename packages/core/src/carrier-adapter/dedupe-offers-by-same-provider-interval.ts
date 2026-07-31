import type { CarrierOffer } from "./types";

export type DedupeOffersBySameProviderIntervalResolve = {
  /** Credential / carrier key for the producing adapter. */
  providerKeyOf: (adapterKey: string | undefined) => string | undefined;
  /**
   * Wider-limits capacity for the producing adapter (higher = wider).
   * Used only to break a price tie. Undefined when the service has no rated
   * capacity — groups that include any unrated offer are not collapsed.
   */
  serviceLimitCapacityOf: (
    adapterKey: string | undefined,
  ) => number | undefined;
};

/**
 * Floor an ISO interval bound to the UTC minute for dedupe keys.
 *
 * WHY: `deliveryIntervalFrom` is the request moment, so parallel calculate
 * calls for two taxi classes never agree to the millisecond (~30 ms skew
 * measured). The seller-facing display already shows minutes only; matching
 * that granularity collapses what looks identical without depending on the
 * display copy string (a wording change must not change which offers hide).
 *
 * Residual edge: two moments a few milliseconds apart can still straddle a
 * minute boundary and produce two keys. With ~30 ms of skew that is roughly
 * one quote in two thousand; the visible consequence is one duplicate pair —
 * acceptable, and much safer than a tolerance comparison, which would not be
 * transitive.
 *
 * Unparseable / blank → returned as trimmed input so only byte-identical
 * leftovers can share a key.
 */
export function floorIsoBoundToUtcMinute(iso: string): string {
  const trimmed = iso.trim();
  if (!trimmed) {
    return trimmed;
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    return trimmed;
  }
  const floored = Math.floor(ms / 60_000) * 60_000;
  return new Date(floored).toISOString();
}

function dedupeKey(providerKey: string, offer: CarrierOffer): string {
  return [
    providerKey,
    floorIsoBoundToUtcMinute(offer.deliveryIntervalFrom),
    floorIsoBoundToUtcMinute(offer.deliveryIntervalTo),
  ].join("\0");
}

/**
 * Collapse offers that share the same delivery interval (from + to, each
 * floored to the UTC minute), but ONLY across different services of the SAME
 * providerKey.
 *
 * NEVER collapse offers from DIFFERENT carriers — hiding one carrier because
 * another quoted the same interval is the opposite of what an orchestrator is
 * for, and it becomes actively wrong the moment CDEK is connected.
 *
 * Within a same-provider same-interval group, KEEP THE CHEAPEST offer: the
 * same interval is the same outcome for the buyer, so the seller wants the
 * lower price. On a price tie, keep the wider `serviceLimitCapacityOf`
 * (capacity is supplied by the caller — never inferred from registry order).
 * If any offer in a duplicate group lacks a capacity rating, the group is
 * left intact.
 *
 * Does not mutate the input. Order of kept offers follows first occurrence
 * of each surviving group.
 */
export function dedupeOffersBySameProviderInterval(
  offers: readonly CarrierOffer[],
  resolve: DedupeOffersBySameProviderIntervalResolve,
): CarrierOffer[] {
  if (offers.length <= 1) {
    return [...offers];
  }

  type Group = {
    members: CarrierOffer[];
  };
  const groups = new Map<string, Group>();
  const order: string[] = [];

  for (let i = 0; i < offers.length; i++) {
    const offer = offers[i]!;
    const providerKey = resolve.providerKeyOf(offer.adapterKey);
    // No provider → cannot share a carrier group; keep unique by index.
    const key =
      providerKey === undefined || providerKey === ""
        ? `\0solo\0${i}`
        : dedupeKey(providerKey, offer);
    const existing = groups.get(key);
    if (existing) {
      existing.members.push(offer);
    } else {
      groups.set(key, { members: [offer] });
      order.push(key);
    }
  }

  const result: CarrierOffer[] = [];
  for (const key of order) {
    const group = groups.get(key)!;
    if (group.members.length === 1) {
      result.push(group.members[0]!);
      continue;
    }

    const capacities = group.members.map((offer) =>
      resolve.serviceLimitCapacityOf(offer.adapterKey),
    );
    if (capacities.some((c) => c === undefined)) {
      // Unrated peer in the group — do not collapse.
      result.push(...group.members);
      continue;
    }

    let best = group.members[0]!;
    let bestCapacity = capacities[0] as number;
    for (let i = 1; i < group.members.length; i++) {
      const candidate = group.members[i]!;
      const capacity = capacities[i] as number;
      if (candidate.priceRub < best.priceRub) {
        best = candidate;
        bestCapacity = capacity;
        continue;
      }
      if (
        candidate.priceRub === best.priceRub &&
        capacity > bestCapacity
      ) {
        best = candidate;
        bestCapacity = capacity;
      }
    }
    result.push(best);
  }

  return result;
}
