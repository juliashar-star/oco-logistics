import assert from "node:assert/strict";
import test from "node:test";

import {
  BULK_SELECTION_LIMIT,
  normalizeShipmentIds,
  parseShipmentIds,
} from "../apps/web/lib/shipments/shipment-ids-request.ts";

test("parseShipmentIds accepts a list of strings", () => {
  assert.deepEqual(parseShipmentIds({ shipmentIds: ["a", "b"] }), ["a", "b"]);
});

test("parseShipmentIds accepts an empty list (the caller decides what that means)", () => {
  assert.deepEqual(parseShipmentIds({ shipmentIds: [] }), []);
});

test("parseShipmentIds rejects a missing field", () => {
  assert.equal(parseShipmentIds({}), null);
});

test("parseShipmentIds rejects null, a bare array and a non-object", () => {
  assert.equal(parseShipmentIds(null), null);
  assert.equal(parseShipmentIds(["a"]), null);
  assert.equal(parseShipmentIds("a"), null);
});

test("parseShipmentIds rejects a list holding a non-string", () => {
  assert.equal(parseShipmentIds({ shipmentIds: ["a", 1] }), null);
  assert.equal(parseShipmentIds({ shipmentIds: ["a", null] }), null);
});

test("normalizeShipmentIds trims", () => {
  assert.deepEqual(normalizeShipmentIds(["  a  "]), ["a"]);
});

test("normalizeShipmentIds drops blank and whitespace-only entries", () => {
  assert.deepEqual(normalizeShipmentIds(["a", "", "   ", "b"]), ["a", "b"]);
});

test("normalizeShipmentIds drops duplicates, including ones that only differ by padding", () => {
  assert.deepEqual(normalizeShipmentIds(["a", "a", " a "]), ["a"]);
});

test("normalizeShipmentIds keeps the first-seen order", () => {
  assert.deepEqual(normalizeShipmentIds(["b", "a", "b"]), ["b", "a"]);
});

test("normalizeShipmentIds of an empty list is an empty list", () => {
  assert.deepEqual(normalizeShipmentIds([]), []);
});

test("the bulk cap is its own constant, not the act's", () => {
  assert.equal(BULK_SELECTION_LIMIT, 100);
});
