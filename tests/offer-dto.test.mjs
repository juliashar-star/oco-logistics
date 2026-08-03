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
  "serviceTitle",
  "supportsThermalBag",
  "deliveryDayFrom",
  "deliveryDayTo",
  "priceIsEstimate",
];

const SAMPLE_OFFER = {
  offerId: "offer-1",
  expiresAt: "2026-07-13T12:15:00.000000Z",
  deliveryIntervalFrom: "2026-07-14T06:00:00.000000Z",
  deliveryIntervalTo: "2026-07-14T15:00:00.000000Z",
  pickupIntervalFrom: "2026-07-13T06:00:00.000000Z",
  pickupIntervalTo: "2026-07-13T15:00:00.000000Z",
  priceRub: 374.54,
  adapterKey: "yataxi:next_day",
  rawOffer: {
    marker: "RAW_OFFER_LEAK_MARKER_abc99",
    giant: "x".repeat(500),
    offer_id: "offer-1",
    nested: { secret: "should-not-leak" },
  },
};

/** Fake resolver — does not touch the real registry. */
function fakeResolveServiceTitle(adapterKey) {
  if (adapterKey === undefined) {
    return "DEFAULT_SERVICE_TITLE";
  }
  return `TITLE_FOR:${adapterKey}`;
}

/** Fake resolver — express/courier support; next_day and unknown do not. */
function fakeResolveSupportsThermalBag(adapterKey) {
  return (
    adapterKey === "yataxi:express" || adapterKey === "yataxi:courier"
  );
}

test("mapped offer key set is exactly the DTO fields (catches future spread of rawOffer)", () => {
  const response = toOffersResponse(
    {
      ok: true,
      offers: [SAMPLE_OFFER],
    },
    fakeResolveServiceTitle,
    fakeResolveSupportsThermalBag,
  );

  assert.equal(response.ok, true);
  assert.equal(response.status, "ok");
  assert.equal(response.offers.length, 1);
  assert.deepEqual(Object.keys(response.offers[0]), EXPECTED_OFFER_KEYS);
});

test("fat rawOffer never appears in serialized response", () => {
  const response = toOffersResponse(
    {
      ok: true,
      offers: [SAMPLE_OFFER],
    },
    fakeResolveServiceTitle,
    fakeResolveSupportsThermalBag,
  );

  const serialized = JSON.stringify(response);
  assert.equal(serialized.includes("RAW_OFFER_LEAK_MARKER_abc99"), false);
  assert.equal(serialized.includes("rawOffer"), false);
  assert.equal(serialized.includes("should-not-leak"), false);
});

test("no_delivery_options -> ok true, status no_delivery_options, empty offers", () => {
  const response = toOffersResponse(
    {
      ok: false,
      reason: "no_delivery_options",
    },
    fakeResolveServiceTitle,
    fakeResolveSupportsThermalBag,
  );
  assert.deepEqual(response, {
    ok: true,
    status: "no_delivery_options",
    offers: [],
  });
});

test("ok with empty offers -> ok true, status ok, empty offers", () => {
  const response = toOffersResponse(
    { ok: true, offers: [] },
    fakeResolveServiceTitle,
    fakeResolveSupportsThermalBag,
  );
  assert.deepEqual(response, {
    ok: true,
    status: "ok",
    offers: [],
  });
});

test("serviceTitle comes from the resolver for each offer, including undefined adapterKey", () => {
  const withKey = { ...SAMPLE_OFFER, offerId: "a", adapterKey: "yataxi:next_day" };
  const withoutKey = {
    ...SAMPLE_OFFER,
    offerId: "b",
    adapterKey: undefined,
  };
  delete withoutKey.adapterKey;

  const response = toOffersResponse(
    { ok: true, offers: [withKey, withoutKey] },
    fakeResolveServiceTitle,
    fakeResolveSupportsThermalBag,
  );

  assert.equal(response.offers[0].serviceTitle, "TITLE_FOR:yataxi:next_day");
  assert.equal(response.offers[1].serviceTitle, "DEFAULT_SERVICE_TITLE");
  assert.equal("adapterKey" in response.offers[0], false);
  assert.equal("adapterKey" in response.offers[1], false);
});

test("supportsThermalBag comes from the resolver; adapterKey stays off the wire", () => {
  const nextDay = {
    ...SAMPLE_OFFER,
    offerId: "a",
    adapterKey: "yataxi:next_day",
  };
  const express = {
    ...SAMPLE_OFFER,
    offerId: "b",
    adapterKey: "yataxi:express",
  };

  const response = toOffersResponse(
    { ok: true, offers: [nextDay, express] },
    fakeResolveServiceTitle,
    fakeResolveSupportsThermalBag,
  );

  assert.equal(response.offers[0].supportsThermalBag, false);
  assert.equal(response.offers[1].supportsThermalBag, true);
  assert.equal("adapterKey" in response.offers[0], false);
});

test("Yandex-shaped offer: day fields absent → \"\", estimate absent → false", () => {
  const response = toOffersResponse(
    { ok: true, offers: [SAMPLE_OFFER] },
    fakeResolveServiceTitle,
    fakeResolveSupportsThermalBag,
  );

  assert.deepEqual(Object.keys(response.offers[0]), EXPECTED_OFFER_KEYS);
  assert.equal(response.offers[0].deliveryDayFrom, "");
  assert.equal(response.offers[0].deliveryDayTo, "");
  assert.equal(response.offers[0].priceIsEstimate, false);
});

test("day-precision offer: days present, priceIsEstimate true", () => {
  const dayOffer = {
    ...SAMPLE_OFFER,
    offerId: "cdek-day",
    deliveryIntervalFrom: "",
    deliveryIntervalTo: "",
    pickupIntervalFrom: "",
    pickupIntervalTo: "",
    deliveryDayFrom: "2026-08-03",
    deliveryDayTo: "2026-08-04",
    priceIsEstimate: true,
    adapterKey: "cdek:parcel",
  };

  const response = toOffersResponse(
    { ok: true, offers: [dayOffer] },
    fakeResolveServiceTitle,
    fakeResolveSupportsThermalBag,
  );

  assert.deepEqual(Object.keys(response.offers[0]), EXPECTED_OFFER_KEYS);
  assert.equal(response.offers[0].deliveryDayFrom, "2026-08-03");
  assert.equal(response.offers[0].deliveryDayTo, "2026-08-04");
  assert.equal(response.offers[0].priceIsEstimate, true);
});
