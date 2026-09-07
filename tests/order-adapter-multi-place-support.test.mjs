import assert from "node:assert/strict";
import test from "node:test";

import { ORDER_ADAPTERS } from "../packages/core/src/carrier-adapter/order-adapters.ts";
import { DEFAULT_ORDER_ADAPTER_KEY } from "../packages/core/src/carrier-adapter/order-adapter-seller-titles.ts";
import {
  ORDER_ADAPTER_MULTI_PLACE_SUPPORT,
  orderAdapterSupportsMultiPlace,
} from "../packages/core/src/carrier-adapter/order-adapter-multi-place-support.ts";

/**
 * Same drift guard as tests/shipment-list-labels.test.mjs uses for the label
 * map: assert KEY PRESENCE, never the resolved value. This map answers false
 * for anything it does not know, so a value check would pass for a key that
 * fell out of the map entirely — the very drift the guard exists to catch.
 */
test("DRIFT GUARD: every ORDER_ADAPTERS key is an own key of ORDER_ADAPTER_MULTI_PLACE_SUPPORT", () => {
  assert.ok(
    Object.prototype.hasOwnProperty.call(
      ORDER_ADAPTER_MULTI_PLACE_SUPPORT,
      DEFAULT_ORDER_ADAPTER_KEY,
    ),
    `DEFAULT_ORDER_ADAPTER_KEY ${JSON.stringify(DEFAULT_ORDER_ADAPTER_KEY)} must be an own key of ORDER_ADAPTER_MULTI_PLACE_SUPPORT`,
  );

  for (const key of Object.keys(ORDER_ADAPTERS)) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(ORDER_ADAPTER_MULTI_PLACE_SUPPORT, key),
      `ORDER_ADAPTERS key ${JSON.stringify(key)} missing from ORDER_ADAPTER_MULTI_PLACE_SUPPORT (the false fallback would hide this drift)`,
    );
  }
});

/**
 * The mirror of the guard above: no key in the map that is not an adapter.
 * Without this, a stale entry for a removed adapter would live on unnoticed.
 */
test("DRIFT GUARD: the map holds no key that is not an ORDER_ADAPTERS key", () => {
  for (const key of Object.keys(ORDER_ADAPTER_MULTI_PLACE_SUPPORT)) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(ORDER_ADAPTERS, key),
      `ORDER_ADAPTER_MULTI_PLACE_SUPPORT key ${JSON.stringify(key)} is not an ORDER_ADAPTERS key`,
    );
  }
});

test("recorded values: only CDEK takes several places today", () => {
  assert.equal(orderAdapterSupportsMultiPlace("cdek:delivery"), true);
  assert.equal(orderAdapterSupportsMultiPlace("yataxi:next_day"), false);
  assert.equal(orderAdapterSupportsMultiPlace("yataxi:express"), false);
  assert.equal(orderAdapterSupportsMultiPlace("yataxi:courier"), false);
});

test("prototype names are not members: constructor and __proto__ answer false", () => {
  assert.equal(orderAdapterSupportsMultiPlace("constructor"), false);
  assert.equal(orderAdapterSupportsMultiPlace("__proto__"), false);
  assert.equal(orderAdapterSupportsMultiPlace("toString"), false);
  assert.equal(orderAdapterSupportsMultiPlace("hasOwnProperty"), false);
});

test("unknown key answers false — NOT the default adapter's value", () => {
  assert.equal(orderAdapterSupportsMultiPlace("rupost:delivery"), false);
  assert.equal(orderAdapterSupportsMultiPlace("cdek:nonexistent"), false);
});

test("null and empty answer false, unlike the label map which returns the default", () => {
  assert.equal(orderAdapterSupportsMultiPlace(null), false);
  assert.equal(orderAdapterSupportsMultiPlace(undefined), false);
  assert.equal(orderAdapterSupportsMultiPlace(""), false);
});
