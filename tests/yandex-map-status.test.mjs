import assert from "node:assert/strict";
import test from "node:test";

import { mapYandexStatusToShipmentStatus } from "../packages/core/src/carrier-adapter/yandex/map-status.ts";

/** Every status named in the map-status.ts buckets — must return non-null. */
const DOCUMENTED_BUCKET_KEYS = [
  // CREATED
  "VALIDATING",
  "DELIVERY_PROCESSING_STARTED",
  "DELIVERY_TRACK_RECIEVED",
  "SORTING_CENTER_PROCESSING_STARTED",
  "SORTING_CENTER_TRACK_RECEIVED",
  "SORTING_CENTER_TRACK_LOADED",
  "DELIVERY_LOADED",
  "SORTING_CENTER_LOADED",
  "CREATED",
  // IN_TRANSIT
  "SORTING_CENTER_AT_START",
  "SORTING_CENTER_PREPARED",
  "SORTING_CENTER_TRANSMITTED",
  "DELIVERY_AT_START",
  "DELIVERY_AT_START_SORT",
  "DELIVERY_TRANSPORTATION",
  "DELIVERY_TRANSPORTATION_RECIPIENT",
  "DELIVERY_ATTEMPT_FAILED",
  // AT_PVZ
  "DELIVERY_ARRIVED_PICKUP_POINT",
  // DELIVERED
  "DELIVERY_TRANSMITTED_TO_RECIPIENT",
  "DELIVERY_DELIVERED",
  "PARTICULARLY_DELIVERED",
  // RETURNED
  "SORTING_CENTER_RETURN_PREPARING",
  "SORTING_CENTER_RETURN_PREPARING_SENDER",
  "SORTING_CENTER_RETURN_ARRIVED",
  "SORTING_CENTER_RETURN_RETURNED",
  "RETURN_PREPARING",
  "RETURN_TRANSPORTATION_STARTED",
  "RETURN_ARRIVED_DELIVERY",
  "RETURN_TRANSMITTED_FULFILMENT",
  "RETURN_READY_FOR_PICKUP",
  "RETURN_RETURNED",
  // CANCELED
  "CANCELLED",
  // PROBLEM
  "VALIDATING_ERROR",
];

test("one representative key per bucket", () => {
  assert.equal(mapYandexStatusToShipmentStatus("CREATED"), "CREATED");
  assert.equal(mapYandexStatusToShipmentStatus("SORTING_CENTER_AT_START"), "IN_TRANSIT");
  assert.equal(mapYandexStatusToShipmentStatus("DELIVERY_ARRIVED_PICKUP_POINT"), "AT_PVZ");
  assert.equal(mapYandexStatusToShipmentStatus("DELIVERY_DELIVERED"), "DELIVERED");
  assert.equal(mapYandexStatusToShipmentStatus("RETURN_RETURNED"), "RETURNED");
  assert.equal(mapYandexStatusToShipmentStatus("CANCELLED"), "CANCELED");
  assert.equal(mapYandexStatusToShipmentStatus("VALIDATING_ERROR"), "PROBLEM");
});

test("Yandex DRAFT → null (duplicate-order trap)", () => {
  assert.equal(mapYandexStatusToShipmentStatus("DRAFT"), null);
});

test("CANCELLED (two Ls) → CANCELED (one L)", () => {
  assert.equal(mapYandexStatusToShipmentStatus("CANCELLED"), "CANCELED");
  assert.equal(mapYandexStatusToShipmentStatus("CANCELED"), null);
});

test("both delivery handoff statuses map to DELIVERED", () => {
  assert.equal(
    mapYandexStatusToShipmentStatus("DELIVERY_TRANSMITTED_TO_RECIPIENT"),
    "DELIVERED",
  );
  assert.equal(mapYandexStatusToShipmentStatus("DELIVERY_DELIVERED"), "DELIVERED");
});

test("unknown key and blank → null", () => {
  assert.equal(mapYandexStatusToShipmentStatus("TOTALLY_UNKNOWN_STATUS"), null);
  assert.equal(mapYandexStatusToShipmentStatus(""), null);
  assert.equal(mapYandexStatusToShipmentStatus("   "), null);
});

test("every documented bucket key returns non-null", () => {
  for (const key of DOCUMENTED_BUCKET_KEYS) {
    const mapped = mapYandexStatusToShipmentStatus(key);
    assert.notEqual(
      mapped,
      null,
      `expected non-null for documented key ${key}`,
    );
  }
});

test("deliberately-null detail statuses stay null", () => {
  assert.equal(mapYandexStatusToShipmentStatus("DELIVERY_STORAGE_PERIOD_EXPIRED"), null);
  assert.equal(mapYandexStatusToShipmentStatus("CONFIRMATION_CODE_RECEIVED"), null);
  assert.equal(mapYandexStatusToShipmentStatus("DELIVERY_TIME_INTERVALS_UPDATED"), null);
});

test("trims surrounding whitespace", () => {
  assert.equal(mapYandexStatusToShipmentStatus("  CREATED  "), "CREATED");
});
