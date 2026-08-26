import assert from "node:assert/strict";
import test from "node:test";

import { ORDER_ADAPTERS } from "../packages/core/src/carrier-adapter/order-adapters.ts";
import {
  EXPRESS_TAXI_CLASS_LIMITS,
  expressTaxiClassParcelLimits,
} from "../packages/core/src/carrier-adapter/yandex/express-taxi-class-limits.ts";
import { CARRIER_REGISTRY } from "../packages/core/src/carrier-picker/registry.ts";

/**
 * DRIFT GUARD between two structures that must agree but cannot import each
 * other: ORDER_ADAPTERS is keyed by adapterKey, CARRIER_REGISTRY by providerKey,
 * and the registry does not distinguish the three yataxi services at all.
 *
 * EVERY LOOKUP ASSERTS THE KEY IS PRESENT BEFORE COMPARING. A test that read
 * `registry.find(...)?.weightLimits?.value?.maxWeightKg` and compared it would
 * pass when the entry disappeared — undefined would meet undefined and the very
 * drift this exists to catch would resolve to a default.
 */

/** @param {string} providerKey */
function registryEntry(providerKey) {
  const entry = CARRIER_REGISTRY.find((c) => c.providerKey === providerKey);
  assert.ok(entry, `registry has no entry for providerKey "${providerKey}"`);
  return entry;
}

/** @param {Record<string, unknown>} object @param {string} key */
function ownValue(object, key, what) {
  assert.ok(
    Object.prototype.hasOwnProperty.call(object, key),
    `${what} is missing the key "${key}"`,
  );
  return object[key];
}

test("cdek:delivery weight cap is the registry's carrier maximum, key present in both", () => {
  const adapter = ownValue(ORDER_ADAPTERS, "cdek:delivery", "ORDER_ADAPTERS");
  const limits = ownValue(adapter, "parcelLimits", "cdek:delivery");
  const declared = ownValue(limits, "maxWeightKg", "cdek:delivery parcelLimits");

  const entry = registryEntry("cdek");
  const sourced = ownValue(entry, "weightLimits", "registry cdek");
  const value = ownValue(sourced, "value", "registry cdek weightLimits");
  const registryMax = ownValue(value, "maxWeightKg", "registry cdek weightLimits.value");

  assert.equal(declared, registryMax);
});

test("cdek:delivery declares NO geometry — the repository holds no sourced CDEK dimension", () => {
  const limits = ORDER_ADAPTERS["cdek:delivery"].parcelLimits;
  assert.ok(limits);
  assert.equal(Object.prototype.hasOwnProperty.call(limits, "maxLongestSideCm"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(limits, "maxSumThreeSidesCm"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(limits, "maxSideCm"), false);

  const value = registryEntry("cdek").weightLimits?.value;
  assert.ok(value);
  assert.equal(Object.prototype.hasOwnProperty.call(value, "maxLongestSideCm"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(value, "maxSumThreeSidesCm"), false);
});

test("yataxi:next_day limits equal the registry pvz variant, key present in both", () => {
  const adapter = ownValue(ORDER_ADAPTERS, "yataxi:next_day", "ORDER_ADAPTERS");
  const limits = ownValue(adapter, "parcelLimits", "yataxi:next_day");

  const variants = ownValue(registryEntry("yataxi"), "variants", "registry yataxi");
  assert.ok(Array.isArray(variants));
  const pvz = variants.find((v) => v.variantKey === "pvz");
  assert.ok(pvz, "registry yataxi has no variant with variantKey \"pvz\"");
  const value = ownValue(
    ownValue(pvz, "weightLimits", "registry yataxi pvz"),
    "value",
    "registry yataxi pvz weightLimits",
  );

  for (const field of ["maxWeightKg", "maxLongestSideCm", "maxSumThreeSidesCm"]) {
    assert.equal(
      ownValue(limits, field, "yataxi:next_day parcelLimits"),
      ownValue(value, field, "registry yataxi pvz weightLimits.value"),
      `${field} drifted from the registry`,
    );
  }
});

test("yataxi:next_day is point-only, because the pvz numbers are sourced for ПВЗ", () => {
  assert.equal(ORDER_ADAPTERS["yataxi:next_day"].parcelLimitsPointOnly, true);
});

test("Express entries are point-agnostic and carry a three-axis box", () => {
  for (const key of ["yataxi:express", "yataxi:courier"]) {
    const adapter = ownValue(ORDER_ADAPTERS, key, "ORDER_ADAPTERS");
    const limits = ownValue(adapter, "parcelLimits", key);
    assert.equal(adapter.parcelLimitsPointOnly, undefined, `${key} must not be point-only`);
    assert.equal(Array.isArray(limits.maxSideCm), true, `${key} must declare a box`);
    assert.equal(limits.maxSideCm.length, 3);
  }
});

/**
 * TWO CLAIMS, AND NEITHER ALONE IS ENOUGH.
 *
 * (a) The CONVERSION produces the documented numbers. Pinned against LITERALS,
 *     because that is the only form that cannot move with the code: comparing
 *     the adapter's value against `expressTaxiClassParcelLimits(...)` alone
 *     would be f(x) versus f(x) — a tautology that passes for any f, including
 *     a metres→centimetres factor changed from 100 to 1000. It is also what
 *     proves the float arithmetic is exact (0.8 × 100 === 80, not
 *     80.00000000000001), which no self-comparison could show.
 *
 * (b) The ADAPTER DERIVES its limits rather than retyping them. Pinned by
 *     comparing against the function's output, so someone replacing the call
 *     with a hand-written literal — which would silently un-couple the adapter
 *     from the documented source — fails here.
 */
test("Express caps: the conversion yields the documented numbers AND the adapters derive them", () => {
  // (a) conversion → literals
  assert.deepEqual(expressTaxiClassParcelLimits(EXPRESS_TAXI_CLASS_LIMITS.courier), {
    maxWeightKg: 10,
    maxSideCm: [80, 50, 50],
  });
  assert.deepEqual(expressTaxiClassParcelLimits(EXPRESS_TAXI_CLASS_LIMITS.express), {
    maxWeightKg: 20,
    maxSideCm: [100, 60, 50],
  });

  // (b) adapters → conversion output
  assert.deepEqual(
    ORDER_ADAPTERS["yataxi:courier"].parcelLimits,
    expressTaxiClassParcelLimits(EXPRESS_TAXI_CLASS_LIMITS.courier),
    "yataxi:courier must derive its limits, not retype them",
  );
  assert.deepEqual(
    ORDER_ADAPTERS["yataxi:express"].parcelLimits,
    expressTaxiClassParcelLimits(EXPRESS_TAXI_CLASS_LIMITS.express),
    "yataxi:express must derive its limits, not retype them",
  );
});
