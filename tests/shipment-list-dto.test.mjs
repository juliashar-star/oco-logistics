import assert from "node:assert/strict";
import test from "node:test";

import { toShipmentListItem } from "../apps/web/lib/shipments/shipment-list-dto.ts";

/** Fake resolver — the real one lives in @oco/core and is the route's to pass. */
function fakeResolveCarrierName(providerKey) {
  return providerKey === "cdek" ? "СДЭК" : `NAME_FOR:${providerKey}`;
}

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
  "selectedOfferServiceName",
  "hasCarrierOrder",
  "confirmWarnings",
  // Was "carrier" ({ name }). DECISION CHANGED 18.08: the cabinet shows the
  // carrier's real name, resolved ON THE SERVER, so the DTO carries a finished
  // string. `Carrier.name` was the provider key uppercased and must never reach
  // a screen; the source row now supplies apishipCode instead.
  "carrierName",
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
  selectedOfferServiceName: null,
  providerOrderId: "req-abc-udp",
  confirmWarnings: /** @type {const} */ ([
    "REQUIREMENT_UNMET",
    "ADDRESS_NOT_FOUND",
  ]),
  carrier: { apishipCode: "cdek" },
  // Extra Prisma-ish fields must not leak through the boundary.
  companyId: "co_LEAK",
  quotedOffers: [{ secret: "should-not-leak" }],
  recipientPhone: "+79001234567",
};

test("mapped shipment list key set is exactly the DTO fields", () => {
  const item = toShipmentListItem(SAMPLE_ROW, fakeResolveCarrierName);
  assert.deepEqual(Object.keys(item), EXPECTED_SHIPMENT_LIST_KEYS);
});

test("confirmWarnings are plain string codes, not objects", () => {
  const item = toShipmentListItem(SAMPLE_ROW, fakeResolveCarrierName);
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
  const item = toShipmentListItem({ ...SAMPLE_ROW, confirmWarnings: [] }, fakeResolveCarrierName);
  assert.deepEqual(item.confirmWarnings, []);
});

test("hasCarrierOrder is derived, and providerOrderId NEVER crosses the boundary", () => {
  const item = toShipmentListItem(SAMPLE_ROW, fakeResolveCarrierName);
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
      toShipmentListItem({ ...SAMPLE_ROW, providerOrderId }, fakeResolveCarrierName).hasCarrierOrder,
      expected,
      label,
    );
  }
});

test("carrierName is a finished string, resolved on the server", () => {
  // Was «carrier is name-only», asserting a nested { name } object taken
  // straight from the legacy table. That column holds the provider key in
  // capital letters, so the DTO now ships a resolved name instead.
  const item = toShipmentListItem(SAMPLE_ROW, fakeResolveCarrierName);
  // SAMPLE_ROW carries providerKey "yataxi", which wins over the legacy code.
  assert.equal(item.carrierName, "NAME_FOR:yataxi");
  assert.equal("carrier" in item, false);
});

test("the legacy row resolves through apishipCode when providerKey is null", () => {
  const legacy = { ...SAMPLE_ROW, providerKey: null };
  assert.equal(
    toShipmentListItem(legacy, fakeResolveCarrierName).carrierName,
    "СДЭК",
  );
});

test("no key at all → empty string, and the resolver is never called", () => {
  let calls = 0;
  const item = toShipmentListItem(
    { ...SAMPLE_ROW, providerKey: null, carrier: null },
    (key) => {
      calls += 1;
      return `NAME_FOR:${key}`;
    },
  );
  assert.equal(item.carrierName, "");
  assert.equal(calls, 0);
});

test("providerKey wins over the legacy apishipCode", () => {
  const item = toShipmentListItem(
    { ...SAMPLE_ROW, providerKey: "yataxi", carrier: { apishipCode: "cdek" } },
    fakeResolveCarrierName,
  );
  assert.equal(item.carrierName, "NAME_FOR:yataxi");
});
