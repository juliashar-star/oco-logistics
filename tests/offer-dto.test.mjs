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
  "serviceName",
  "carrierName",
  "freeCancelBoundary",
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

/** Fake resolver — masked carrier label by adapter family. */
function fakeResolveCarrierName(adapterKey) {
  if (adapterKey === undefined) {
    return "DEFAULT_CARRIER";
  }
  if (String(adapterKey).startsWith("cdek:")) {
    return "Перевозчик №2";
  }
  return "Перевозчик №1";
}

/** Fake resolver — a neutral key, never a sentence and never a carrier name. */
function fakeResolveFreeCancelBoundary(adapterKey) {
  if (String(adapterKey).startsWith("cdek:")) {
    return "until_warehouse_intake";
  }
  if (adapterKey === "yataxi:express" || adapterKey === "yataxi:courier") {
    return "until_courier_pickup";
  }
  return "unknown";
}

function mapOffers(result) {
  return toOffersResponse(
    result,
    fakeResolveServiceTitle,
    fakeResolveSupportsThermalBag,
    fakeResolveCarrierName,
    fakeResolveFreeCancelBoundary,
  );
}

test("mapped offer key set is exactly the DTO fields (catches future spread of rawOffer)", () => {
  const response = mapOffers({
    ok: true,
    offers: [SAMPLE_OFFER],
  });

  assert.equal(response.ok, true);
  assert.equal(response.status, "ok");
  assert.equal(response.offers.length, 1);
  assert.deepEqual(Object.keys(response.offers[0]), EXPECTED_OFFER_KEYS);
});

test("fat rawOffer never appears in serialized response", () => {
  const response = mapOffers({
    ok: true,
    offers: [SAMPLE_OFFER],
  });

  const serialized = JSON.stringify(response);
  assert.equal(serialized.includes("RAW_OFFER_LEAK_MARKER_abc99"), false);
  assert.equal(serialized.includes("rawOffer"), false);
  assert.equal(serialized.includes("should-not-leak"), false);
});

test("no_delivery_options -> ok true, status no_delivery_options, empty offers", () => {
  const response = mapOffers({
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
  const response = mapOffers({ ok: true, offers: [] });
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

  const response = mapOffers({ ok: true, offers: [withKey, withoutKey] });

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

  const response = mapOffers({ ok: true, offers: [nextDay, express] });

  assert.equal(response.offers[0].supportsThermalBag, false);
  assert.equal(response.offers[1].supportsThermalBag, true);
  assert.equal("adapterKey" in response.offers[0], false);
});

test("freeCancelBoundary comes from the resolver; adapterKey stays off the wire", () => {
  const nextDay = { ...SAMPLE_OFFER, offerId: "a", adapterKey: "yataxi:next_day" };
  const express = { ...SAMPLE_OFFER, offerId: "b", adapterKey: "yataxi:express" };
  const cdek = { ...SAMPLE_OFFER, offerId: "c", adapterKey: "cdek:delivery" };

  const response = mapOffers({ ok: true, offers: [nextDay, express, cdek] });

  assert.equal(response.offers[0].freeCancelBoundary, "unknown");
  assert.equal(response.offers[1].freeCancelBoundary, "until_courier_pickup");
  assert.equal(response.offers[2].freeCancelBoundary, "until_warehouse_intake");
  assert.equal("adapterKey" in response.offers[0], false);
});

test("the boundary on the wire is a key, never the seller-facing sentence", () => {
  // The DTO carries a code and the wording is built in the UI layer — the same
  // split as supportsThermalBag / «без термосумки». A Russian sentence here
  // would mean the server had started deciding what the card says.
  const response = mapOffers({ ok: true, offers: [SAMPLE_OFFER] });
  const boundary = response.offers[0].freeCancelBoundary;

  assert.equal(typeof boundary, "string");
  assert.doesNotMatch(boundary, /[А-Яа-яЁё]/);
  assert.doesNotMatch(boundary, /\s/);
});

test("Yandex-shaped offer: day fields absent → \"\", estimate absent → false", () => {
  const response = mapOffers({ ok: true, offers: [SAMPLE_OFFER] });

  assert.deepEqual(Object.keys(response.offers[0]), EXPECTED_OFFER_KEYS);
  assert.equal(response.offers[0].deliveryDayFrom, "");
  assert.equal(response.offers[0].deliveryDayTo, "");
  assert.equal(response.offers[0].priceIsEstimate, false);
  assert.equal(response.offers[0].serviceName, "");
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

  const response = mapOffers({ ok: true, offers: [dayOffer] });

  assert.deepEqual(Object.keys(response.offers[0]), EXPECTED_OFFER_KEYS);
  assert.equal(response.offers[0].deliveryDayFrom, "2026-08-03");
  assert.equal(response.offers[0].deliveryDayTo, "2026-08-04");
  assert.equal(response.offers[0].priceIsEstimate, true);
  assert.equal(response.offers[0].serviceName, "");
});

test("serviceName: absent → \"\"; present → exact carrier string", () => {
  const without = { ...SAMPLE_OFFER, offerId: "a" };
  const withName = {
    ...SAMPLE_OFFER,
    offerId: "b",
    serviceName: "Посылка склад-склад",
  };

  const response = mapOffers({ ok: true, offers: [without, withName] });

  assert.equal(response.offers[0].serviceName, "");
  assert.equal(response.offers[1].serviceName, "Посылка склад-склад");
  assert.deepEqual(Object.keys(response.offers[0]), EXPECTED_OFFER_KEYS);
  assert.deepEqual(Object.keys(response.offers[1]), EXPECTED_OFFER_KEYS);
});

test("carrierName comes from the resolver; providerKey stays off the wire", () => {
  const yandex = {
    ...SAMPLE_OFFER,
    offerId: "a",
    adapterKey: "yataxi:next_day",
  };
  const cdek = {
    ...SAMPLE_OFFER,
    offerId: "b",
    adapterKey: "cdek:delivery",
  };
  const withoutKey = {
    ...SAMPLE_OFFER,
    offerId: "c",
    adapterKey: undefined,
  };
  delete withoutKey.adapterKey;

  const response = mapOffers({ ok: true, offers: [yandex, cdek, withoutKey] });

  assert.equal(response.offers[0].carrierName, "Перевозчик №1");
  assert.equal(response.offers[1].carrierName, "Перевозчик №2");
  assert.equal(response.offers[2].carrierName, "DEFAULT_CARRIER");
  assert.equal("providerKey" in response.offers[0], false);
  assert.equal("adapterKey" in response.offers[0], false);
  assert.deepEqual(Object.keys(response.offers[0]), EXPECTED_OFFER_KEYS);
});
