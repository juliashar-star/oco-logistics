import assert from "node:assert/strict";
import test from "node:test";

import { tallyShipmentsByCarrier } from "../apps/web/lib/shipments/tally-shipments-by-carrier.ts";

/** Legacy carrier table as the dashboard reads it: id → apishipCode. */
const CARRIERS = new Map([
  ["carrier-cdek", "cdek"],
  ["carrier-dostavista", "dostavista"],
  ["carrier-cse", "cse"],
]);

test("empty input → empty result", () => {
  assert.deepEqual(tallyShipmentsByCarrier([], CARRIERS), []);
});

test("rows with providerKey only (direct path)", () => {
  const rows = [
    { providerKey: "yataxi", carrierId: null, count: 19 },
    { providerKey: "cdek", carrierId: null, count: 2 },
  ];
  assert.deepEqual(tallyShipmentsByCarrier(rows, CARRIERS), [
    { providerKey: "yataxi", count: 19 },
    { providerKey: "cdek", count: 2 },
  ]);
});

test("rows with carrierId only (APIShip path) resolve through the legacy table", () => {
  const rows = [
    { providerKey: null, carrierId: "carrier-cdek", count: 9 },
    { providerKey: null, carrierId: "carrier-dostavista", count: 2 },
  ];
  assert.deepEqual(tallyShipmentsByCarrier(rows, CARRIERS), [
    { providerKey: "cdek", count: 9 },
    { providerKey: "dostavista", count: 2 },
  ]);
});

test("the same carrier arriving by BOTH paths merges into one group", () => {
  const rows = [
    { providerKey: "cdek", carrierId: null, count: 2 },
    { providerKey: null, carrierId: "carrier-cdek", count: 9 },
  ];
  assert.deepEqual(tallyShipmentsByCarrier(rows, CARRIERS), [
    { providerKey: "cdek", count: 11 },
  ]);
});

test("a row carrying BOTH columns counts once, under providerKey", () => {
  const rows = [{ providerKey: "cdek", carrierId: "carrier-dostavista", count: 4 }];
  assert.deepEqual(tallyShipmentsByCarrier(rows, CARRIERS), [
    { providerKey: "cdek", count: 4 },
  ]);
});

test("a row with neither column is not counted", () => {
  const rows = [
    { providerKey: null, carrierId: null, count: 1 },
    { providerKey: "yataxi", carrierId: null, count: 3 },
  ];
  assert.deepEqual(tallyShipmentsByCarrier(rows, CARRIERS), [
    { providerKey: "yataxi", count: 3 },
  ]);
});

test("a carrierId missing from the legacy table is not counted", () => {
  const rows = [{ providerKey: null, carrierId: "carrier-gone", count: 5 }];
  assert.deepEqual(tallyShipmentsByCarrier(rows, CARRIERS), []);
});

test("a blank providerKey is treated as absent, not as a carrier", () => {
  const rows = [{ providerKey: "   ", carrierId: null, count: 7 }];
  assert.deepEqual(tallyShipmentsByCarrier(rows, CARRIERS), []);
});

test("mixed paths: every group sorted by count, descending", () => {
  const rows = [
    { providerKey: null, carrierId: "carrier-cse", count: 1 },
    { providerKey: "cdek", carrierId: null, count: 2 },
    { providerKey: "yataxi", carrierId: null, count: 19 },
    { providerKey: null, carrierId: "carrier-cdek", count: 9 },
    { providerKey: null, carrierId: "carrier-dostavista", count: 2 },
    { providerKey: null, carrierId: null, count: 1 },
  ];
  assert.deepEqual(tallyShipmentsByCarrier(rows, CARRIERS), [
    { providerKey: "yataxi", count: 19 },
    { providerKey: "cdek", count: 11 },
    { providerKey: "dostavista", count: 2 },
    { providerKey: "cse", count: 1 },
  ]);
});

test("equal counts fall back to the key, so the order never reshuffles", () => {
  const rows = [
    { providerKey: "yataxi", carrierId: null, count: 5 },
    { providerKey: "cdek", carrierId: null, count: 5 },
  ];
  assert.deepEqual(tallyShipmentsByCarrier(rows, CARRIERS), [
    { providerKey: "cdek", count: 5 },
    { providerKey: "yataxi", count: 5 },
  ]);
});
