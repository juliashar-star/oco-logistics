import test from "node:test";
import assert from "node:assert/strict";

// Локальная копия deriveFactBasedProfiles из packages/core/src/carrier-picker/profile-fit.ts
// (тот же runner, что rank-carriers-health.test.mjs — без transpile workspace packages).
function deriveFactBasedProfiles(carrier) {
  const profiles = [];
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

function carrierFixture(overrides = {}) {
  return {
    providerKey: "fixture",
    displayName: "Fixture Carrier",
    profiles: [],
    methods: [],
    notes: "",
    healthStatus: "active",
    ...overrides,
  };
}

test("maxWeightKg 35 derives P6", () => {
  const result = deriveFactBasedProfiles(
    carrierFixture({ weightLimits: { value: { maxWeightKg: 35 } } }),
  );
  assert.ok(result.includes("P6"));
});

test("maxSideSumCm 150 without maxWeightKg derives P6", () => {
  const result = deriveFactBasedProfiles(
    carrierFixture({ weightLimits: { value: { maxSideSumCm: 150 } } }),
  );
  assert.ok(result.includes("P6"));
});

test("maxWeightKg 20 derives P5 but not P6", () => {
  const result = deriveFactBasedProfiles(
    carrierFixture({ weightLimits: { value: { maxWeightKg: 20 } } }),
  );
  assert.ok(result.includes("P5"));
  assert.equal(result.includes("P6"), false);
});

test("perishable specialMode derives P7", () => {
  const result = deriveFactBasedProfiles(
    carrierFixture({ specialModes: { value: ["perishable"] } }),
  );
  assert.ok(result.includes("P7"));
});

test("no weightLimits and no specialModes returns empty array", () => {
  const result = deriveFactBasedProfiles(carrierFixture());
  assert.deepEqual(result, []);
});

test("maxWeightKg 40 and perishable derives both P6 and P7", () => {
  const result = deriveFactBasedProfiles(
    carrierFixture({
      weightLimits: { value: { maxWeightKg: 40 } },
      specialModes: { value: ["perishable"] },
    }),
  );
  assert.ok(result.includes("P6"));
  assert.ok(result.includes("P7"));
});
