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

test("carrier is name-only", () => {
  const item = toShipmentListItem(SAMPLE_ROW);
  assert.deepEqual(Object.keys(item.carrier), ["name"]);
  assert.equal(item.carrier.name, "Яндекс Доставка");
});
