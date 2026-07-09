import test from "node:test";
import assert from "node:assert/strict";

import { deriveFactBasedProfiles } from "../packages/core/src/carrier-picker/profile-fit.ts";

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
    carrierFixture({
      weightLimits: { value: { applicable: true, maxWeightKg: 35 } },
    }),
  );
  assert.ok(result.includes("P6"));
});

test("maxLongestSideCm 150 without maxWeightKg derives P6", () => {
  const result = deriveFactBasedProfiles(
    carrierFixture({
      weightLimits: { value: { applicable: true, maxLongestSideCm: 150 } },
    }),
  );
  assert.ok(result.includes("P6"));
});

test("maxWeightKg 20 derives P5 but not P6", () => {
  const result = deriveFactBasedProfiles(
    carrierFixture({
      weightLimits: { value: { applicable: true, maxWeightKg: 20 } },
    }),
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
      weightLimits: { value: { applicable: true, maxWeightKg: 40 } },
      specialModes: { value: ["perishable"] },
    }),
  );
  assert.ok(result.includes("P6"));
  assert.ok(result.includes("P7"));
});
