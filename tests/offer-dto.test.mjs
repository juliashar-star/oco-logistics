import assert from "node:assert/strict";
import test from "node:test";

import { toOffersResponse } from "../apps/web/lib/shipments/offer-dto.ts";

// OFFER PIN. Order-sensitive. Unchanged by the adapter-status notice slice:
// that field is a TOP-LEVEL envelope key, deliberately not a per-offer one —
// an adapter that produced no offers has no offer to hang it on.
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

/**
 * What the route genuinely sends for a company that has not set a priority —
 * which is every company today, the column being nullable with no backfill.
 * The route builds it by calling preselectOffer with the real priority, so this
 * default describes production rather than a value chosen to make a pin pass.
 */
const NO_PRESELECT = { offerId: null, reason: "no_rule" };

function mapOffers(result, adaptersWithoutOffers = [], preselect = NO_PRESELECT) {
  return toOffersResponse(
    result,
    fakeResolveServiceTitle,
    fakeResolveSupportsThermalBag,
    fakeResolveCarrierName,
    fakeResolveFreeCancelBoundary,
    adaptersWithoutOffers,
    preselect,
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

// ENVELOPE PIN. deepEqual on the whole object, so any new top-level key fails
// here — which is what it is for. `adaptersWithoutOffers` was added by the
// adapter-status notice slice: the fan-out already knew which adapter produced
// nothing, and the browser had no way to learn it. `preselect` was added by the
// default-priority slice, and this pin caught it on the first run — both cases
// below were updated deliberately, not defaulted away.
test("no_delivery_options -> ok true, status no_delivery_options, empty offers", () => {
  const response = mapOffers({
    ok: false,
    reason: "no_delivery_options",
  });
  assert.deepEqual(response, {
    ok: true,
    status: "no_delivery_options",
    offers: [],
    adaptersWithoutOffers: [],
    preselect: { offerId: null, reason: "no_rule" },
  });
});

test("ok with empty offers -> ok true, status ok, empty offers", () => {
  const response = mapOffers({ ok: true, offers: [] });
  assert.deepEqual(response, {
    ok: true,
    status: "ok",
    offers: [],
    adaptersWithoutOffers: [],
    preselect: { offerId: null, reason: "no_rule" },
  });
});

test("preselect is carried through verbatim, not recomputed by the mapper", () => {
  const response = mapOffers({ ok: true, offers: [] }, [], {
    offerId: "o-1",
    reason: "rule",
  });
  assert.deepEqual(response.preselect, { offerId: "o-1", reason: "rule" });
});

// ── adaptersWithoutOffers: three fields, and neither key ───────────────────

test("adaptersWithoutOffers is carried through with exactly three fields", () => {
  const response = mapOffers({ ok: true, offers: [SAMPLE_OFFER] }, [
    {
      carrierName: "Перевозчик №2",
      serviceTitle: "Доставка по России",
      status: "failed",
    },
  ]);
  assert.equal(response.adaptersWithoutOffers.length, 1);
  assert.deepEqual(Object.keys(response.adaptersWithoutOffers[0]), [
    "carrierName",
    "serviceTitle",
    "status",
  ]);
});

test("adapter key and providerKey stay off the wire", () => {
  // Same guard as «adapterKey stays off the wire» for offers: the fan-out entry
  // carries the registry key, and the display map exists to mask providerKey.
  const adapterKey = "cdek:delivery_LEAK_MARKER_abc99";
  const providerKey = "cdek_PROVIDER_LEAK_zzz";
  const response = mapOffers({ ok: true, offers: [SAMPLE_OFFER] }, [
    {
      carrierName: "Перевозчик №2",
      serviceTitle: "Доставка по России",
      status: "auth_failed",
      key: adapterKey,
      adapterKey,
      providerKey,
    },
  ]);

  const entry = response.adaptersWithoutOffers[0];
  assert.equal("key" in entry, false);
  assert.equal("adapterKey" in entry, false);
  assert.equal("providerKey" in entry, false);

  const serialized = JSON.stringify(response);
  assert.equal(serialized.includes("LEAK_MARKER_abc99"), false);
  assert.equal(serialized.includes("PROVIDER_LEAK_zzz"), false);
  assert.equal(serialized.includes("adapterKey"), false);
  assert.equal(serialized.includes("providerKey"), false);
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
