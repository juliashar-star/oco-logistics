import type { CarrierOrderItem } from "./types";

/**
 * What one SERVICE will carry, in the units our own types already use —
 * centimetres and kilograms. Every field is optional and an absent field is
 * NOT CHECKED: «we have no sourced number» must never read as «no limit», and
 * inventing one would filter a seller's parcel on a guess.
 *
 * Two ways of expressing geometry, because our two sources express it
 * differently and flattening one into the other loses information:
 *   - `maxSideCm` is a BOX (three axes), how Yandex Express states its classes;
 *   - `maxLongestSideCm` / `maxSumThreeSidesCm` are the registry's shape, taken
 *     from carriers that publish one longest side and a sum of three.
 * A service may declare either, both, or neither.
 */
export type ServiceParcelLimits = {
  maxWeightKg?: number;
  maxLongestSideCm?: number;
  maxSumThreeSidesCm?: number;
  maxSideCm?: readonly [number, number, number];
};

function allSidesReadable(item: CarrierOrderItem): boolean {
  return (
    Number.isFinite(item.lengthCm) &&
    Number.isFinite(item.widthCm) &&
    Number.isFinite(item.heightCm)
  );
}

/**
 * Whether this parcel fits a service's declared limits.
 *
 * PURE, and the comparison lives here rather than in any one carrier's file
 * because none of it is carrier-specific: it was written for Yandex Express and
 * is now the single rule every adapter is measured against.
 *
 * WEIGHT IS PER ORDER, GEOMETRY IS PER ITEM. Not symmetry for its own sake —
 * the registry says so for the family that has the numbers: «лимит на
 * посылку/коробку внутри заказа … лимит на весь заказ шире» (registry.ts, the
 * yataxi `pvz` variant). Sides are a property of one box; weight accumulates.
 *
 * ORIENTATION DOES NOT MATTER for `maxSideCm`: both the parcel's sides and the
 * limit's are sorted descending and compared pairwise, so a 50×80×50 parcel and
 * an 80×50×50 limit agree.
 *
 * AN UNREADABLE DIMENSION SKIPS THE GEOMETRY CHECKS FOR THAT ITEM, and does not
 * throw. A missing measurement is our data gap, and turning it into a refusal
 * would hide a whole carrier from a seller over a blank field. Weight is still
 * checked. Callers that need a stricter reading validate before calling — the
 * Express adapter does exactly that, so its own behaviour is unchanged.
 *
 * AN EMPTY ITEM LIST IS «DOES NOT FIT». Preserved from the Express filter this
 * replaces: there is no parcel to carry, and answering «fits» would send an
 * empty order to a carrier.
 *
 * ITS REACH GREW, AND WHAT KEEPS IT HARMLESS IS ELSEWHERE. When this rule lived
 * in the Express adapter it sank one service; the fan-out now applies it to
 * every service that declares limits, which today is all four — so an empty list
 * would drop the entire list and tell the seller their parcel is too large,
 * about an order that has no parcel at all. That is unreachable ONLY because
 * `buildOfferInput` constructs a literal one-element array (see
 * apps/web/lib/shipments/build-offer-input.ts) — a fact about a different file,
 * which is exactly the kind of assumption that rots quietly. It is pinned by a
 * test asserting that array is length 1, so changing it fails loudly there
 * rather than silently here.
 */
export function parcelFitsServiceLimits(
  items: readonly CarrierOrderItem[],
  limits: ServiceParcelLimits,
): boolean {
  if (items.length === 0) {
    return false;
  }

  const limitSides =
    limits.maxSideCm === undefined
      ? null
      : [...limits.maxSideCm].sort((a, b) => b - a);

  let totalWeightKg = 0;
  for (const item of items) {
    totalWeightKg += (item.weightG / 1000) * item.quantity;

    if (!allSidesReadable(item)) {
      continue;
    }
    const sides = [
      item.lengthCm as number,
      item.widthCm as number,
      item.heightCm as number,
    ];
    const sorted = [...sides].sort((a, b) => b - a);

    if (
      limitSides !== null &&
      (sorted[0]! > limitSides[0]! ||
        sorted[1]! > limitSides[1]! ||
        sorted[2]! > limitSides[2]!)
    ) {
      return false;
    }
    if (
      limits.maxLongestSideCm !== undefined &&
      sorted[0]! > limits.maxLongestSideCm
    ) {
      return false;
    }
    if (
      limits.maxSumThreeSidesCm !== undefined &&
      sides[0]! + sides[1]! + sides[2]! > limits.maxSumThreeSidesCm
    ) {
      return false;
    }
  }

  if (limits.maxWeightKg !== undefined && totalWeightKg > limits.maxWeightKg) {
    return false;
  }
  return true;
}
