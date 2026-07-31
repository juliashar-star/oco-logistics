import assert from "node:assert/strict";
import test from "node:test";

import { isExpressTaxiClassUsableForParcel } from "../packages/core/src/carrier-adapter/yandex/express-client.ts";
import {
  EXPRESS_TAXI_CLASS_LIMITS,
  expressTaxiClassCapacity,
} from "../packages/core/src/carrier-adapter/yandex/express-taxi-class-limits.ts";

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

test("expressTaxiClassCapacity: express wider than courier (documented caps)", () => {
  assert.ok(
    expressTaxiClassCapacity(EXPRESS_TAXI_CLASS_LIMITS.express) >
      expressTaxiClassCapacity(EXPRESS_TAXI_CLASS_LIMITS.courier),
  );
});

test("isExpressTaxiClassUsableForParcel: light parcel fits courier and express", () => {
  const items = [item({ weightG: 5000, lengthCm: 40, widthCm: 30, heightCm: 20 })];
  assert.equal(
    isExpressTaxiClassUsableForParcel(items, EXPRESS_TAXI_CLASS_LIMITS.courier),
    true,
  );
  assert.equal(
    isExpressTaxiClassUsableForParcel(items, EXPRESS_TAXI_CLASS_LIMITS.express),
    true,
  );
});

test("isExpressTaxiClassUsableForParcel: 15 kg fits express, not courier (Yandex would still quote courier)", () => {
  const items = [item({ weightG: 15_000 })];
  assert.equal(
    isExpressTaxiClassUsableForParcel(items, EXPRESS_TAXI_CLASS_LIMITS.courier),
    false,
  );
  assert.equal(
    isExpressTaxiClassUsableForParcel(items, EXPRESS_TAXI_CLASS_LIMITS.express),
    true,
  );
});

test("isExpressTaxiClassUsableForParcel: oversize for courier dims, ok for express", () => {
  // courier max 0.80×0.50×0.50; express 1.00×0.60×0.50
  const items = [item({ lengthCm: 90, widthCm: 55, heightCm: 40 })];
  assert.equal(
    isExpressTaxiClassUsableForParcel(items, EXPRESS_TAXI_CLASS_LIMITS.courier),
    false,
  );
  assert.equal(
    isExpressTaxiClassUsableForParcel(items, EXPRESS_TAXI_CLASS_LIMITS.express),
    true,
  );
});

test("isExpressTaxiClassUsableForParcel: orientation does not matter (sides sorted)", () => {
  // Same box as 80×50×50 courier max, rotated as 50×80×50.
  const items = [item({ lengthCm: 50, widthCm: 80, heightCm: 50, weightG: 9000 })];
  assert.equal(
    isExpressTaxiClassUsableForParcel(items, EXPRESS_TAXI_CLASS_LIMITS.courier),
    true,
  );
});

test("isExpressTaxiClassUsableForParcel: quantity multiplies weight", () => {
  const items = [item({ weightG: 6000, quantity: 2 })];
  assert.equal(
    isExpressTaxiClassUsableForParcel(items, EXPRESS_TAXI_CLASS_LIMITS.courier),
    false,
  );
  assert.equal(
    isExpressTaxiClassUsableForParcel(items, EXPRESS_TAXI_CLASS_LIMITS.express),
    true,
  );
});

test("isExpressTaxiClassUsableForParcel: empty items → false", () => {
  assert.equal(
    isExpressTaxiClassUsableForParcel([], EXPRESS_TAXI_CLASS_LIMITS.courier),
    false,
  );
});
