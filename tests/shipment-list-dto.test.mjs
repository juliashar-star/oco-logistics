import assert from "node:assert/strict";
import test from "node:test";

import { toShipmentListItem } from "../apps/web/lib/shipments/shipment-list-dto.ts";

const EXPECTED_SHIPMENT_LIST_KEYS = [
  "id",
  "createdAt",
  "status",
  "trackNumber",
  "trackingUrl",
  "labelUrl",
  "recipientName",
  "destCity",
  "plannedCost",
  "plannedDeliveryDays",
  "isReturned",
  "isCanceled",
  "returnReason",
  "isAnonymized",
  "providerKey",
  "orderAdapterKey",
  "hasCarrierOrder",
  "confirmWarnings",
  "carrier",
];

const SAMPLE_ROW = {
  id: "ship_1",
  createdAt: new Date("2026-07-31T12:00:00.000Z"),
  status: /** @type {const} */ ("CREATED"),
  trackNumber: "trk-1",
  trackingUrl: "https://example.com/track",
  labelUrl: null,
  recipientName: "Иванов",
  destCity: "Москва",
  plannedCost: 27328,
  plannedDeliveryDays: null,
  isReturned: false,
  isCanceled: false,
  returnReason: null,
  isAnonymized: false,
  providerKey: "yataxi",
  orderAdapterKey: "yataxi:express",
  providerOrderId: "req-abc-udp",
  confirmWarnings: /** @type {const} */ ([
    "REQUIREMENT_UNMET",
    "ADDRESS_NOT_FOUND",
  ]),
  carrier: { name: "Яндекс Доставка" },
  // Extra Prisma-ish fields must not leak through the boundary.
  companyId: "co_LEAK",
  quotedOffers: [{ secret: "should-not-leak" }],
  recipientPhone: "+79001234567",
};

test("mapped shipment list key set is exactly the DTO fields", () => {
  const item = toShipmentListItem(SAMPLE_ROW);
  assert.deepEqual(Object.keys(item), EXPECTED_SHIPMENT_LIST_KEYS);
});

test("confirmWarnings are plain string codes, not objects", () => {
  const item = toShipmentListItem(SAMPLE_ROW);
  assert.deepEqual(item.confirmWarnings, [
    "REQUIREMENT_UNMET",
    "ADDRESS_NOT_FOUND",
  ]);
  for (const code of item.confirmWarnings) {
    assert.equal(typeof code, "string");
  }
  const serialized = JSON.stringify(item);
  assert.equal(serialized.includes("companyId"), false);
  assert.equal(serialized.includes("should-not-leak"), false);
  assert.equal(serialized.includes("recipientPhone"), false);
});

test("empty confirmWarnings stays an empty array", () => {
  const item = toShipmentListItem({ ...SAMPLE_ROW, confirmWarnings: [] });
  assert.deepEqual(item.confirmWarnings, []);
});

test("hasCarrierOrder is derived, and providerOrderId NEVER crosses the boundary", () => {
  const item = toShipmentListItem(SAMPLE_ROW);
  assert.equal(item.hasCarrierOrder, true);
  // The id itself must not appear anywhere on the wire — not as a field, and
  // not as a value hidden inside another one.
  assert.equal("providerOrderId" in item, false);
  assert.equal(JSON.stringify(item).includes("req-abc-udp"), false);
});

test("hasCarrierOrder follows the same blank rule as the cancel route", () => {
  // The route's first precondition is `== null || trim() === ""`. These four
  // must agree with it exactly, or the control and the server disagree about
  // what «exists at the carrier» means.
  for (const [label, providerOrderId, expected] of [
    ["a real id", "req-abc-udp", true],
    ["null", null, false],
    ["empty string", "", false],
    ["whitespace only", "   ", false],
  ]) {
    assert.equal(
      toShipmentListItem({ ...SAMPLE_ROW, providerOrderId }).hasCarrierOrder,
      expected,
      label,
    );
  }
});

test("carrier is name-only", () => {
  const item = toShipmentListItem(SAMPLE_ROW);
  assert.deepEqual(Object.keys(item.carrier), ["name"]);
  assert.equal(item.carrier.name, "Яндекс Доставка");
});
