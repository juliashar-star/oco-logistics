import assert from "node:assert/strict";
import test from "node:test";

import { mapYandexPickupPointTypeToKind } from "../packages/core/src/carrier-adapter/yandex/map-pickup-point-kind.ts";

test("pickup_point → pickup_point", () => {
  assert.equal(mapYandexPickupPointTypeToKind("pickup_point"), "pickup_point");
});

test("terminal → postamat", () => {
  assert.equal(mapYandexPickupPointTypeToKind("terminal"), "postamat");
});

test("warehouse → warehouse", () => {
  assert.equal(mapYandexPickupPointTypeToKind("warehouse"), "warehouse");
});

test("unknown type → unknown", () => {
  assert.equal(mapYandexPickupPointTypeToKind("drone_locker"), "unknown");
});

test("empty → unknown", () => {
  assert.equal(mapYandexPickupPointTypeToKind(""), "unknown");
});

test("whitespace → unknown", () => {
  assert.equal(mapYandexPickupPointTypeToKind("   "), "unknown");
});

test("trims surrounding whitespace", () => {
  assert.equal(mapYandexPickupPointTypeToKind("  terminal  "), "postamat");
});
