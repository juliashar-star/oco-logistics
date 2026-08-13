import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ORDER_ADAPTER,
  ORDER_ADAPTERS,
  resolveOrderAdapter,
  resolveOrderAdapterStrict,
} from "../packages/core/src/carrier-adapter/order-adapters.ts";
import { PROTOTYPE_KEYS } from "./helpers/prototype-keys.mjs";

/**
 * PART 1 — what resolveOrderAdapter does TODAY, recorded before anything moved.
 *
 * These are not aspirational: they pin the defaulting behaviour that the order
 * CREATION path (submit / offers) still depends on, so that a later change to
 * resolveOrderAdapter cannot silently take the fallback away from submit. They
 * are expected to keep passing forever unless that dependency is dealt with
 * deliberately.
 */
test("resolveOrderAdapter(null) returns the Yandex default", () => {
  assert.equal(resolveOrderAdapter(null), DEFAULT_ORDER_ADAPTER);
  assert.equal(resolveOrderAdapter(null).key, "yataxi:next_day");
});

test("resolveOrderAdapter(undefined) returns the Yandex default", () => {
  assert.equal(resolveOrderAdapter(undefined), DEFAULT_ORDER_ADAPTER);
});

test("resolveOrderAdapter('') returns the Yandex default", () => {
  assert.equal(resolveOrderAdapter(""), DEFAULT_ORDER_ADAPTER);
});

test("resolveOrderAdapter(unknown key) returns the Yandex default", () => {
  assert.equal(resolveOrderAdapter("nope"), DEFAULT_ORDER_ADAPTER);
  assert.equal(resolveOrderAdapter("cdek:nonexistent"), DEFAULT_ORDER_ADAPTER);
});

test("resolveOrderAdapter(known key) returns that exact entry", () => {
  assert.equal(
    resolveOrderAdapter("cdek:delivery"),
    ORDER_ADAPTERS["cdek:delivery"],
  );
});

/**
 * PART 2 — the guarantee the destructive path relies on. Identity comparisons
 * (assert.equal on objects is reference equality), not key comparisons: the
 * cancel route calls cancelOrder on whatever object comes back, so returning a
 * look-alike would satisfy a key check and still call the wrong carrier.
 */
test("resolveOrderAdapterStrict(known key) returns the same object by reference", () => {
  for (const key of Object.keys(ORDER_ADAPTERS)) {
    assert.equal(resolveOrderAdapterStrict(key), ORDER_ADAPTERS[key]);
  }
});

test("resolveOrderAdapterStrict(null) returns null", () => {
  assert.equal(resolveOrderAdapterStrict(null), null);
});

test("resolveOrderAdapterStrict(undefined) returns null", () => {
  assert.equal(resolveOrderAdapterStrict(undefined), null);
});

test("resolveOrderAdapterStrict('') returns null", () => {
  assert.equal(resolveOrderAdapterStrict(""), null);
});

test("resolveOrderAdapterStrict(unknown key) returns null", () => {
  assert.equal(resolveOrderAdapterStrict("nope"), null);
  assert.equal(resolveOrderAdapterStrict("cdek:nonexistent"), null);
});

/**
 * PART 3 — inherited Object.prototype members are NOT adapters.
 *
 * A plain `obj[key]` index walks the prototype chain, so "constructor",
 * "toString", "__proto__" and "valueOf" all resolve to something truthy that is
 * not an adapter. That defeats the strict guard by construction: `=== null` is
 * false, the cancel route proceeds, and `providerKey` / `cancelOrder` are both
 * undefined on the value it got. Measured before the fix, all four returned a
 * prototype member from BOTH lookups.
 */
// The list moved to tests/helpers/prototype-keys.mjs so every lookup test feeds
// in the same names — see the docblock there.

test("resolveOrderAdapterStrict returns null for inherited Object keys", () => {
  for (const key of PROTOTYPE_KEYS) {
    assert.equal(
      resolveOrderAdapterStrict(key),
      null,
      `strict(${JSON.stringify(key)}) must be null, not an inherited member`,
    );
  }
});

test("resolveOrderAdapter returns the default for inherited Object keys", () => {
  for (const key of PROTOTYPE_KEYS) {
    assert.equal(
      resolveOrderAdapter(key),
      DEFAULT_ORDER_ADAPTER,
      `resolve(${JSON.stringify(key)}) must fall back, not return an inherited member`,
    );
  }
});

test("strict and defaulting lookups DISAGREE on exactly the unresolvable keys", () => {
  // The whole point of the slice in one assertion: same answer whenever the key
  // is real, opposite answers whenever it is not.
  for (const key of Object.keys(ORDER_ADAPTERS)) {
    assert.equal(resolveOrderAdapterStrict(key), resolveOrderAdapter(key));
  }
  for (const key of [null, undefined, "", "nope"]) {
    assert.equal(resolveOrderAdapterStrict(key), null);
    assert.equal(resolveOrderAdapter(key), DEFAULT_ORDER_ADAPTER);
  }
});
