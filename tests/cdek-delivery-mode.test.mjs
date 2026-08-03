import assert from "node:assert/strict";
import test from "node:test";

import { cdekDeliveryMode } from "../packages/core/src/carrier-adapter/cdek/delivery-mode.ts";

test("DROP_OFF + PVZ → 4 склад-склад", () => {
  assert.equal(cdekDeliveryMode("DROP_OFF", "PVZ"), 4);
});

test("DROP_OFF + COURIER → 3 склад-дверь", () => {
  assert.equal(cdekDeliveryMode("DROP_OFF", "COURIER"), 3);
});

test("COURIER + PVZ → 2 дверь-склад", () => {
  assert.equal(cdekDeliveryMode("COURIER", "PVZ"), 2);
});

test("COURIER + COURIER → 1 дверь-дверь", () => {
  assert.equal(cdekDeliveryMode("COURIER", "COURIER"), 1);
});

test("undefined handoverMode treated as DROP_OFF", () => {
  assert.equal(cdekDeliveryMode(undefined, "PVZ"), 4);
  assert.equal(cdekDeliveryMode(undefined, "COURIER"), 3);
});
