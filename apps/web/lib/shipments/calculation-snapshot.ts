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
  needsThermalBag: boolean;
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
 * declaredValueRub + destCity + needsThermalBag, then destination key by type
 * (destAddress for COURIER, pointOutId for PVZ).
 * Do NOT touch the pickupType comparison — latent defect noted separately.
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
  if (b.pickupType === "COURIER") return a.destAddress === b.destAddress;
  return a.pointOutId === b.pointOutId;
}
