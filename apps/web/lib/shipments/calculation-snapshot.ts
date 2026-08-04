export type CalculationSnapshot = {
  recipientName: string;
  recipientPhone: string;
  weightG: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  /** Yandex draft/offer input — both PVZ and COURIER. */
  declaredValueRub: string;
  destCity: string;
  destAddress: string;
  pointOutId: string;
  pickupType: "PVZ" | "COURIER";
  // Without this a seller can quote «привезу сам» at the cheaper price, switch
  // to «заберёт курьер», and submit against a price for a service that costs
  // roughly double.
  handoverMode: "DROP_OFF" | "COURIER";
  needsThermalBag: boolean;
  /**
   * Carrier network of the chosen pickup point (empty when none / courier).
   * Switching Yandex ↔ CDEK changes the carrier and therefore the price, so a
   * quote taken before the switch must not survive it.
   * calculationSnapshotKey hashes the object's own entries sorted by key, so
   * this field joins the invalidate-quotes effect dependencies automatically.
   */
  pvzProviderKey: string;
};

/**
 * Stable string of every field on the snapshot, derived from the object's own
 * entries sorted by key — a field added to CalculationSnapshot is included
 * automatically rather than by memory.
 *
 * WHY it exists: it is the invalidate-quotes effect's dependency. Hand-listing
 * each snapshot field in that useEffect's array (behind
 * `eslint-disable exhaustive-deps`) caused a real divergence — needsThermalBag
 * was on the type and in snapshotsEqual but missing from the array, so ticking
 * the box left stale offers on screen while the card painted from live state.
 */
export function calculationSnapshotKey(snapshot: CalculationSnapshot): string {
  return JSON.stringify(
    Object.entries(snapshot).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

/**
 * Yandex draft/offer inputs for both PVZ and COURIER: base fields +
 * declaredValueRub + destCity + needsThermalBag + handoverMode +
 * pvzProviderKey + pickupType, then destination key by type (destAddress for
 * COURIER, pointOutId for PVZ).
 */
export function snapshotsEqual(
  a: CalculationSnapshot,
  b: CalculationSnapshot,
): boolean {
  const baseEqual =
    a.recipientName === b.recipientName &&
    a.recipientPhone === b.recipientPhone &&
    a.weightG === b.weightG &&
    a.lengthCm === b.lengthCm &&
    a.widthCm === b.widthCm &&
    a.heightCm === b.heightCm;

  if (!baseEqual) {
    return false;
  }

  if (a.declaredValueRub !== b.declaredValueRub) return false;
  if (a.destCity !== b.destCity) return false;
  if (a.needsThermalBag !== b.needsThermalBag) return false;
  if (a.handoverMode !== b.handoverMode) return false;
  if (a.pvzProviderKey !== b.pvzProviderKey) return false;
  // Compare pickupType itself — not only as a switch for which destination
  // field to read. When both destAddress and pointOutId are blank, differing
  // pickupType alone used to compare equal and leave a stale quote on screen.
  if (a.pickupType !== b.pickupType) return false;
  if (b.pickupType === "COURIER") return a.destAddress === b.destAddress;
  return a.pointOutId === b.pointOutId;
}
