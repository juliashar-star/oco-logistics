import type { CarrierPickupPointKind } from "./types";

/**
 * Documented Yandex other-day limits for delivery to a ПОСТАМАТ (one order).
 * Source (quoted, not inferred):
 *   https://yandex.ru/support/delivery-profile/ru/other-day/weight-limits
 *   — max weight 20 kg; max one side 40 cm; max sum of sides 118 cm.
 *
 * Yandex also states that violating these limits can cancel the order at ANY
 * stage of delivery — quoting does not refuse an over-limit parcel.
 *
 * Regular ПВЗ box caps (30 kg / 150 cm / sum 300) and 5Post box caps
 * (15 kg / 64 cm / sum 136) are NOT checked here: our neutral `kind` cannot
 * tell a 5Post point from a Market one, so a kind-wide 5Post rule would
 * falsely mark Market ПВЗ. Non-postamat kinds therefore always «fit» today.
 */
export const POSTAMAT_MAX_WEIGHT_G = 20_000;
export const POSTAMAT_MAX_SIDE_CM = 40;
export const POSTAMAT_MAX_SIDES_SUM_CM = 118;

export type ParcelForPickupPointFit = {
  weightG: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

/**
 * Whether the parcel fits the documented limits for this pickup-point kind.
 * Pure: no I/O. Non-postamat kinds → true (no check today — see file comment).
 * Non-finite inputs → true (do not mark on unreadable entry).
 */
export function parcelFitsPickupPointKind(
  parcel: ParcelForPickupPointFit,
  kind: CarrierPickupPointKind,
): boolean {
  if (kind !== "postamat") {
    return true;
  }

  const { weightG, lengthCm, widthCm, heightCm } = parcel;
  if (
    !Number.isFinite(weightG) ||
    !Number.isFinite(lengthCm) ||
    !Number.isFinite(widthCm) ||
    !Number.isFinite(heightCm)
  ) {
    return true;
  }

  const longestSideCm = Math.max(lengthCm, widthCm, heightCm);
  const sidesSumCm = lengthCm + widthCm + heightCm;

  return (
    weightG <= POSTAMAT_MAX_WEIGHT_G &&
    longestSideCm <= POSTAMAT_MAX_SIDE_CM &&
    sidesSumCm <= POSTAMAT_MAX_SIDES_SUM_CM
  );
}
