import assert from "node:assert/strict";
import test from "node:test";

import {
  claimStatusTextRu,
  mapClaimStatusToShipmentStatus,
} from "../packages/core/src/carrier-adapter/yandex/map-claim-status.ts";

test("new → CREATED", () => {
  assert.equal(mapClaimStatusToShipmentStatus("new"), "CREATED");
});
test("estimating → CREATED", () => {
  assert.equal(mapClaimStatusToShipmentStatus("estimating"), "CREATED");
});
test("ready_for_approval → CREATED", () => {
  assert.equal(mapClaimStatusToShipmentStatus("ready_for_approval"), "CREATED");
});
test("accepted → CREATED", () => {
  assert.equal(mapClaimStatusToShipmentStatus("accepted"), "CREATED");
});
test("performer_lookup → CREATED", () => {
  assert.equal(mapClaimStatusToShipmentStatus("performer_lookup"), "CREATED");
});
test("performer_draft → CREATED", () => {
  assert.equal(mapClaimStatusToShipmentStatus("performer_draft"), "CREATED");
});
test("performer_found → CREATED", () => {
  assert.equal(mapClaimStatusToShipmentStatus("performer_found"), "CREATED");
});
test("pickup_arrived → CREATED", () => {
  assert.equal(mapClaimStatusToShipmentStatus("pickup_arrived"), "CREATED");
});
test("ready_for_pickup_confirmation → CREATED", () => {
  assert.equal(
    mapClaimStatusToShipmentStatus("ready_for_pickup_confirmation"),
    "CREATED",
  );
});

test("pickuped → IN_TRANSIT", () => {
  assert.equal(mapClaimStatusToShipmentStatus("pickuped"), "IN_TRANSIT");
});
test("delivery_arrived → IN_TRANSIT", () => {
  assert.equal(mapClaimStatusToShipmentStatus("delivery_arrived"), "IN_TRANSIT");
});
test("ready_for_delivery_confirmation → IN_TRANSIT", () => {
  assert.equal(
    mapClaimStatusToShipmentStatus("ready_for_delivery_confirmation"),
    "IN_TRANSIT",
  );
});
test("pay_waiting → IN_TRANSIT", () => {
  assert.equal(mapClaimStatusToShipmentStatus("pay_waiting"), "IN_TRANSIT");
});

test("delivered → DELIVERED", () => {
  assert.equal(mapClaimStatusToShipmentStatus("delivered"), "DELIVERED");
});
test("delivered_finish → DELIVERED", () => {
  assert.equal(mapClaimStatusToShipmentStatus("delivered_finish"), "DELIVERED");
});

test("returning → RETURNED", () => {
  assert.equal(mapClaimStatusToShipmentStatus("returning"), "RETURNED");
});
test("return_arrived → RETURNED", () => {
  assert.equal(mapClaimStatusToShipmentStatus("return_arrived"), "RETURNED");
});
test("ready_for_return_confirmation → RETURNED", () => {
  assert.equal(
    mapClaimStatusToShipmentStatus("ready_for_return_confirmation"),
    "RETURNED",
  );
});
test("returned → RETURNED", () => {
  assert.equal(mapClaimStatusToShipmentStatus("returned"), "RETURNED");
});
test("returned_finish → RETURNED", () => {
  assert.equal(mapClaimStatusToShipmentStatus("returned_finish"), "RETURNED");
});

test("cancelled → CANCELED", () => {
  assert.equal(mapClaimStatusToShipmentStatus("cancelled"), "CANCELED");
});
test("cancelled_by_taxi → CANCELED", () => {
  assert.equal(mapClaimStatusToShipmentStatus("cancelled_by_taxi"), "CANCELED");
});
test("cancelled_with_payment → CANCELED", () => {
  assert.equal(
    mapClaimStatusToShipmentStatus("cancelled_with_payment"),
    "CANCELED",
  );
});
test("cancelled_with_items_on_hands → CANCELED", () => {
  assert.equal(
    mapClaimStatusToShipmentStatus("cancelled_with_items_on_hands"),
    "CANCELED",
  );
});

test("failed → PROBLEM", () => {
  assert.equal(mapClaimStatusToShipmentStatus("failed"), "PROBLEM");
});
test("estimating_failed → PROBLEM", () => {
  assert.equal(mapClaimStatusToShipmentStatus("estimating_failed"), "PROBLEM");
});
test("performer_not_found → PROBLEM", () => {
  assert.equal(mapClaimStatusToShipmentStatus("performer_not_found"), "PROBLEM");
});

test("unknown → null", () => {
  assert.equal(mapClaimStatusToShipmentStatus("totally_unknown_status"), null);
});
test("empty → null", () => {
  assert.equal(mapClaimStatusToShipmentStatus(""), null);
});
test("whitespace → null", () => {
  assert.equal(mapClaimStatusToShipmentStatus("   "), null);
});

test("trims surrounding whitespace", () => {
  assert.equal(mapClaimStatusToShipmentStatus("  pickuped  "), "IN_TRANSIT");
});

test("claimStatusTextRu: pickup_arrived label", () => {
  assert.equal(
    claimStatusTextRu("pickup_arrived"),
    "Курьер приехал к отправителю",
  );
});
test("claimStatusTextRu: unknown → null", () => {
  assert.equal(claimStatusTextRu("totally_unknown_status"), null);
});
test("claimStatusTextRu: empty → null", () => {
  assert.equal(claimStatusTextRu(""), null);
});
