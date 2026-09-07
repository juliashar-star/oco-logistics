import assert from "node:assert/strict";
import test from "node:test";

import { computePlaceFromItems } from "../packages/core/src/carrier-adapter/compute-place-from-items.ts";

/**
 * Numbers mirror EXPECTED_TWO_ITEM_BODY in tests/yandex-get-offers.test.mjs so
 * the direct test and the indirect one assert the same arithmetic.
 */
const ITEM_A = {
  name: "Товар А",
  quantity: 2,
  unitPriceRub: 100,
  weightG: 500,
  lengthCm: 30,
  widthCm: 20,
  heightCm: 10,
};

const ITEM_B = {
  name: "Товар Б",
  quantity: 1,
  unitPriceRub: 50,
  weightG: 300,
  lengthCm: 40,
  widthCm: 15,
  heightCm: 25,
};

test("one item: weight is weightG * quantity, sides are that item's sides", () => {
  assert.deepEqual(computePlaceFromItems([ITEM_B]), {
    weightG: 300,
    lengthCm: 40,
    widthCm: 15,
    heightCm: 25,
  });
});

test("two items of different sizes: each side is the per-axis maximum", () => {
  assert.deepEqual(computePlaceFromItems([ITEM_A, ITEM_B]), {
    weightG: 1300,
    lengthCm: 40,
    widthCm: 20,
    heightCm: 25,
  });
});

test("quantity above one multiplies weight but never the sides", () => {
  assert.deepEqual(computePlaceFromItems([ITEM_A]), {
    weightG: 1000,
    lengthCm: 30,
    widthCm: 20,
    heightCm: 10,
  });
});

test("item without dimensions contributes 1 on every absent side", () => {
  const noDims = {
    name: "Без габаритов",
    quantity: 1,
    unitPriceRub: 10,
    weightG: 200,
  };
  assert.deepEqual(computePlaceFromItems([noDims]), {
    weightG: 200,
    lengthCm: 1,
    widthCm: 1,
    heightCm: 1,
  });
});

test("a dimensionless item does not shrink a sized one: max keeps the real sides", () => {
  const noDims = {
    name: "Без габаритов",
    quantity: 1,
    unitPriceRub: 10,
    weightG: 200,
  };
  assert.deepEqual(computePlaceFromItems([ITEM_B, noDims]), {
    weightG: 500,
    lengthCm: 40,
    widthCm: 15,
    heightCm: 25,
  });
});
