import type { Carrier, ProfileId } from "./registry";

// Пороги совпадают с шипмент-роутингом в rank.ts (P5: 15–30кг и стороны
// ≤120см; P6: >30кг или стороны >120см), применены здесь к заявленной
// вместимости перевозчика, а не к весу конкретной посылки. P1–P4 сознательно
// не выводятся из фактов на этом этапе (см. docs/OCO_carrier_rating_spec_1.md
// §3.4; scope decision 2026-07-06) — остаются статическим полем profiles
// в registry.ts.
export function deriveFactBasedProfiles(carrier: Carrier): ProfileId[] {
  const profiles: ProfileId[] = [];
  const weightLimits = carrier.weightLimits?.value;

  if (weightLimits) {
    const { maxWeightKg, maxSideSumCm } = weightLimits;
    const exceedsP6 =
      (maxWeightKg !== undefined && maxWeightKg > 30) ||
      (maxSideSumCm !== undefined && maxSideSumCm > 120);

    if (exceedsP6) {
      profiles.push("P6");
    } else if (
      maxWeightKg !== undefined &&
      maxWeightKg >= 15 &&
      maxWeightKg <= 30
    ) {
      profiles.push("P5");
    }
  }

  const specialModes = carrier.specialModes?.value ?? [];
  if (specialModes.includes("perishable")) {
    profiles.push("P7");
  }

  return profiles;
}
