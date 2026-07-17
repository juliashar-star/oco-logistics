import assert from "node:assert/strict";
import test from "node:test";

import { toOffersResponse } from "../apps/web/lib/shipments/offer-dto.ts";

const EXPECTED_OFFER_KEYS = [
  "offerId",
  "expiresAt",
  "deliveryIntervalFrom",
  "deliveryIntervalTo",
  "pickupIntervalFrom",
  "pickupIntervalTo",
  "priceRub",
];

const SAMPLE_OFFER = {
  offerId: "offer-1",
  expiresAt: "2026-07-13T12:15:00.000000Z",
  deliveryIntervalFrom: "2026-07-14T06:00:00.000000Z",
  deliveryIntervalTo: "2026-07-14T15:00:00.000000Z",
  pickupIntervalFrom: "2026-07-13T06:00:00.000000Z",
  pickupIntervalTo: "2026-07-13T15:00:00.000000Z",
  priceRub: 374.54,
  rawOffer: {
    marker: "RAW_OFFER_LEAK_MARKER_abc99",
    giant: "x".repeat(500),
    offer_id: "offer-1",
    nested: { secret: "should-not-leak" },
  },
};

test("mapped offer key set is exactly the DTO fields (catches future spread of rawOffer)", () => {
  const response = toOffersResponse({
    ok: true,
    offers: [SAMPLE_OFFER],
  });

  assert.equal(response.ok, true);
  assert.equal(response.status, "ok");
  assert.equal(response.offers.length, 1);
  assert.deepEqual(Object.keys(response.offers[0]), EXPECTED_OFFER_KEYS);
});

test("fat rawOffer never appears in serialized response", () => {
  const response = toOffersResponse({
    ok: true,
    offers: [SAMPLE_OFFER],
  });

  const serialized = JSON.stringify(response);
  assert.equal(serialized.includes("RAW_OFFER_LEAK_MARKER_abc99"), false);
  assert.equal(serialized.includes("rawOffer"), false);
  assert.equal(serialized.includes("should-not-leak"), false);
});

test("no_delivery_options -> ok true, status no_delivery_options, empty offers", () => {
  const response = toOffersResponse({
    ok: false,
    reason: "no_delivery_options",
  });
  assert.deepEqual(response, {
    ok: true,
    status: "no_delivery_options",
    offers: [],
  });
});

test("ok with empty offers -> ok true, status ok, empty offers", () => {
  const response = toOffersResponse({ ok: true, offers: [] });
  assert.deepEqual(response, {
    ok: true,
    status: "ok",
    offers: [],
  });
});
