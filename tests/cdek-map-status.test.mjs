import assert from "node:assert/strict";
import test from "node:test";

import { mapCdekStatusToShipmentStatus } from "../packages/core/src/carrier-adapter/cdek/map-status.ts";

/**
 * Exhaustive table: every code from CDEK OpenAPI «Приложение 1. Статусы заказов»
 * → expected neutral ShipmentStatus. 35 codes.
 */
const EXHAUSTIVE_TABLE = [
  // CREATED (2)
  ["ACCEPTED", "CREATED"],
  ["CREATED", "CREATED"],
  // IN_TRANSIT (22)
  ["RECEIVED_AT_SHIPMENT_WAREHOUSE", "IN_TRANSIT"],
  ["READY_FOR_SHIPMENT_IN_SENDER_CITY", "IN_TRANSIT"],
  ["TAKEN_BY_TRANSPORTER_FROM_SENDER_CITY", "IN_TRANSIT"],
  ["SENT_TO_RECIPIENT_CITY", "IN_TRANSIT"],
  ["ACCEPTED_IN_RECIPIENT_CITY", "IN_TRANSIT"],
  ["ACCEPTED_AT_RECIPIENT_CITY_WAREHOUSE", "IN_TRANSIT"],
  ["TAKEN_BY_COURIER", "IN_TRANSIT"],
  ["ACCEPTED_AT_TRANSIT_WAREHOUSE", "IN_TRANSIT"],
  ["READY_FOR_SHIPMENT_IN_TRANSIT_CITY", "IN_TRANSIT"],
  ["TAKEN_BY_TRANSPORTER_FROM_TRANSIT_CITY", "IN_TRANSIT"],
  ["SENT_TO_TRANSIT_CITY", "IN_TRANSIT"],
  ["ACCEPTED_IN_TRANSIT_CITY", "IN_TRANSIT"],
  ["SENT_TO_SENDER_CITY", "IN_TRANSIT"],
  ["ACCEPTED_IN_SENDER_CITY", "IN_TRANSIT"],
  ["ENTERED_TO_TRANSIT_WAREHOUSE", "IN_TRANSIT"],
  ["ENTERED_TO_RECIPIENT_CITY_WAREHOUSE", "IN_TRANSIT"],
  ["IN_CUSTOMS_INTERNATIONAL", "IN_TRANSIT"],
  ["SHIPPED_TO_DESTINATION", "IN_TRANSIT"],
  ["PASSED_TO_TRANSIT_CARRIER", "IN_TRANSIT"],
  ["IN_CUSTOMS_LOCAL", "IN_TRANSIT"],
  ["CUSTOMS_COMPLETE", "IN_TRANSIT"],
  ["POSTOMAT_SEIZED", "IN_TRANSIT"],
  // AT_PVZ (3)
  ["ACCEPTED_AT_PICK_UP_POINT", "AT_PVZ"],
  ["ENTERED_TO_PICK_UP_POINT", "AT_PVZ"],
  ["POSTOMAT_POSTED", "AT_PVZ"],
  // DELIVERED (2)
  ["DELIVERED", "DELIVERED"],
  ["POSTOMAT_RECEIVED", "DELIVERED"],
  // RETURNED (4)
  ["NOT_DELIVERED", "RETURNED"],
  ["RETURNED_TO_SENDER_CITY_WAREHOUSE", "RETURNED"],
  ["RETURNED_TO_TRANSIT_WAREHOUSE", "RETURNED"],
  ["RETURNED_TO_RECIPIENT_CITY_WAREHOUSE", "RETURNED"],
  // CANCELED (1)
  ["REMOVED", "CANCELED"],
  // PROBLEM (1)
  ["INVALID", "PROBLEM"],
];

test("exhaustive table: all 35 CDEK codes", () => {
  assert.equal(EXHAUSTIVE_TABLE.length, 35);
  const codes = EXHAUSTIVE_TABLE.map(([code]) => code);
  assert.equal(new Set(codes).size, 35, "duplicate code in the exhaustive table");
  for (const [code, expected] of EXHAUSTIVE_TABLE) {
    assert.equal(
      mapCdekStatusToShipmentStatus(code),
      expected,
      `${code} → ${expected}`,
    );
  }
});

test("unknown code → null", () => {
  assert.equal(mapCdekStatusToShipmentStatus("TOTALLY_UNKNOWN_STATUS"), null);
});

test("blank → null", () => {
  assert.equal(mapCdekStatusToShipmentStatus(""), null);
  assert.equal(mapCdekStatusToShipmentStatus("   "), null);
});

test("lowercase real code → null (no case-fold, mirror Yandex)", () => {
  assert.equal(mapCdekStatusToShipmentStatus("created"), null);
});

test("non-string → null", () => {
  assert.equal(mapCdekStatusToShipmentStatus(null), null);
  assert.equal(mapCdekStatusToShipmentStatus(42), null);
});

test("trims surrounding whitespace (mirror Yandex)", () => {
  assert.equal(mapCdekStatusToShipmentStatus("  CREATED  "), "CREATED");
});
