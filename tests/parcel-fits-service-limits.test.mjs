import assert from "node:assert/strict";
import test from "node:test";

import { parcelFitsServiceLimits } from "../packages/core/src/carrier-adapter/parcel-fits-service-limits.ts";

function item(overrides = {}) {
  return {
    name: "Посылка",
    quantity: 1,
    unitPriceRub: 100,
    weightG: 1000,
    lengthCm: 30,
    widthCm: 20,
    heightCm: 10,
    ...overrides,
  };
}

test("empty limits accept anything with items", () => {
  assert.equal(parcelFitsServiceLimits([item({ weightG: 900_000 })], {}), true);
});

test("empty item list does not fit", () => {
  assert.equal(parcelFitsServiceLimits([], { maxWeightKg: 10 }), false);
});

test("weight is summed across items and multiplied by quantity", () => {
  assert.equal(
    parcelFitsServiceLimits([item({ weightG: 5000, quantity: 2 })], {
      maxWeightKg: 10,
    }),
    true,
  );
  assert.equal(
    parcelFitsServiceLimits([item({ weightG: 5001, quantity: 2 })], {
      maxWeightKg: 10,
    }),
    false,
  );
  assert.equal(
    parcelFitsServiceLimits(
      [item({ weightG: 6000 }), item({ weightG: 5000 })],
      { maxWeightKg: 10 },
    ),
    false,
  );
});

test("maxLongestSideCm: boundary passes, one centimetre over fails", () => {
  assert.equal(
    parcelFitsServiceLimits([item({ lengthCm: 150 })], {
      maxLongestSideCm: 150,
    }),
    true,
  );
  assert.equal(
    parcelFitsServiceLimits([item({ lengthCm: 151 })], {
      maxLongestSideCm: 150,
    }),
    false,
  );
});

test("maxLongestSideCm looks at the longest side whichever axis it is on", () => {
  assert.equal(
    parcelFitsServiceLimits([item({ lengthCm: 10, widthCm: 10, heightCm: 151 })], {
      maxLongestSideCm: 150,
    }),
    false,
  );
});

test("maxSumThreeSidesCm: boundary passes, one centimetre over fails", () => {
  assert.equal(
    parcelFitsServiceLimits(
      [item({ lengthCm: 100, widthCm: 100, heightCm: 100 })],
      { maxSumThreeSidesCm: 300 },
    ),
    true,
  );
  assert.equal(
    parcelFitsServiceLimits(
      [item({ lengthCm: 100, widthCm: 100, heightCm: 101 })],
      { maxSumThreeSidesCm: 300 },
    ),
    false,
  );
});

test("sum of sides is judged per item, not across the order", () => {
  // Two boxes of 300 each: every box fits, the order is not summed.
  assert.equal(
    parcelFitsServiceLimits(
      [
        item({ lengthCm: 100, widthCm: 100, heightCm: 100 }),
        item({ lengthCm: 100, widthCm: 100, heightCm: 100 }),
      ],
      { maxSumThreeSidesCm: 300 },
    ),
    true,
  );
});

test("maxSideCm compares sorted triples, so orientation does not matter", () => {
  const limits = { maxSideCm: [80, 50, 50] };
  assert.equal(
    parcelFitsServiceLimits(
      [item({ lengthCm: 50, widthCm: 80, heightCm: 50 })],
      limits,
    ),
    true,
  );
  assert.equal(
    parcelFitsServiceLimits(
      [item({ lengthCm: 50, widthCm: 51, heightCm: 80 })],
      limits,
    ),
    false,
  );
});

test("an absent limit field is never checked", () => {
  // No weight cap: a 900 kg parcel passes. No geometry cap: a 5 m side passes.
  assert.equal(
    parcelFitsServiceLimits([item({ weightG: 900_000 })], {
      maxLongestSideCm: 150,
    }),
    true,
  );
  assert.equal(
    parcelFitsServiceLimits([item({ lengthCm: 500 })], { maxWeightKg: 10 }),
    true,
  );
});

test("an unreadable dimension skips geometry for that item but still weighs it", () => {
  const noSides = { name: "Посылка", quantity: 1, unitPriceRub: 100, weightG: 1000 };
  assert.equal(
    parcelFitsServiceLimits([noSides], { maxLongestSideCm: 1 }),
    true,
    "missing sides must not refuse a whole carrier",
  );
  assert.equal(
    parcelFitsServiceLimits([noSides], { maxWeightKg: 0.5 }),
    false,
    "weight is still checked when sides are missing",
  );
});
