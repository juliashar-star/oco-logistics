import assert from "node:assert/strict";
import test from "node:test";

import { listOffersForOrderAdapters } from "../packages/core/src/carrier-adapter/list-offers-for-order-adapters.ts";

/** @typedef {import("../packages/core/src/carrier-adapter/order-adapters.ts").OrderAdapter} OrderAdapter */
/** @typedef {import("../packages/core/src/carrier-adapter/types.ts").CarrierCreateOrderInput} CarrierCreateOrderInput */
/** @typedef {import("../packages/core/src/carrier-adapter/types.ts").CarrierCredentials} CarrierCredentials */
/** @typedef {import("../packages/core/src/carrier-adapter/select-order-adapters-for-connected-carriers.ts").SelectedOrderAdapter} SelectedOrderAdapter */

const CREDS = { token: "t", platformStationId: "station" };

/**
 * @param {{ weightG?: number, lengthCm?: number, widthCm?: number, heightCm?: number, quantity?: number, pointOutId?: string }} [parcel]
 * @returns {CarrierCreateOrderInput}
 */
function input(parcel = {}) {
  const {
    weightG = 500,
    lengthCm = 30,
    widthCm = 20,
    heightCm = 10,
    quantity = 1,
    pointOutId,
  } = parcel;
  return /** @type {CarrierCreateOrderInput} */ ({
    providerKey: "yataxi",
    clientNumber: "oco-test",
    sender: {
      countryCode: "RU",
      contactName: "Sender",
      phone: "+74951234567",
      city: "Москва",
      addressString: "Москва",
    },
    recipient: {
      countryCode: "RU",
      contactName: "Recipient",
      phone: "+79001234567",
      city: "Москва",
      addressString: "ул. Тверская, 1",
    },
    ...(pointOutId === undefined ? {} : { pointOutId }),
    items: [
      {
        name: "Посылка",
        quantity,
        unitPriceRub: 100,
        weightG,
        lengthCm,
        widthCm,
        heightCm,
      },
    ],
  });
}

/**
 * Counts calls so the test can assert the adapter was never reached — the
 * point of filtering in the fan-out is that the network call does not happen.
 * @param {string} key
 * @param {OrderAdapter["parcelLimits"]} parcelLimits
 */
function countingAdapter(key, parcelLimits) {
  const calls = { count: 0 };
  /** @type {OrderAdapter} */
  const adapter = {
    key,
    providerKey: "yataxi",
    title: key,
    ...(parcelLimits === undefined ? {} : { parcelLimits }),
    getOffers: async () => {
      calls.count += 1;
      return {
        ok: true,
        offers: [
          {
            offerId: `${key}-offer`,
            expiresAt: "2099-01-01T00:00:00Z",
            deliveryIntervalFrom: "2099-01-02T00:00:00Z",
            deliveryIntervalTo: "2099-01-02T12:00:00Z",
            pickupIntervalFrom: "2099-01-01T00:00:00Z",
            pickupIntervalTo: "2099-01-01T12:00:00Z",
            priceRub: 300,
          },
        ],
      };
    },
    confirmOffer: async () => {
      throw new Error("confirmOffer must not be called");
    },
    cancelOrder: async () => {
      throw new Error("cancelOrder must not be called");
    },
  };
  return { adapter, calls };
}

/**
 * @param {OrderAdapter[]} adapters
 * @returns {SelectedOrderAdapter[]}
 */
function withCreds(adapters) {
  return adapters.map((adapter) => ({ adapter, credentials: CREDS }));
}

// The Express courier class, in the units the neutral limit set uses:
// 10 kg, 80×50×50 cm (FAQ, via EXPRESS_TAXI_CLASS_LIMITS).
const COURIER_LIMITS = {
  maxWeightKg: 10,
  maxSideCm: /** @type {[number, number, number]} */ ([80, 50, 50]),
};

test("15 kg parcel: a service whose limits refuse it drops out without being called", async () => {
  const { adapter, calls } = countingAdapter("yataxi:courier", COURIER_LIMITS);

  const result = await listOffersForOrderAdapters(
    input({ weightG: 15_000 }),
    withCreds([adapter]),
  );

  assert.equal(
    calls.count,
    0,
    "adapter must not be called for a parcel its limits refuse",
  );
  assert.deepEqual(result.adapters, [
    { key: "yataxi:courier", status: "parcel_too_large" },
  ]);
  assert.deepEqual(result.offers, []);
});

test("15 kg parcel: a service with no declared limits is still called", async () => {
  const { adapter, calls } = countingAdapter("cdek:delivery", undefined);

  const result = await listOffersForOrderAdapters(
    input({ weightG: 15_000 }),
    withCreds([adapter]),
  );

  assert.equal(calls.count, 1, "no declared limits must never filter");
  assert.deepEqual(result.adapters, [{ key: "cdek:delivery", status: "ok" }]);
  assert.equal(result.offers.length, 1);
});

test("a parcel within the limits reaches the adapter unchanged", async () => {
  const { adapter, calls } = countingAdapter("yataxi:courier", COURIER_LIMITS);

  const result = await listOffersForOrderAdapters(
    input({ weightG: 5_000 }),
    withCreds([adapter]),
  );

  assert.equal(calls.count, 1);
  assert.deepEqual(result.adapters, [{ key: "yataxi:courier", status: "ok" }]);
  assert.equal(result.offers.length, 1);
});

test("one service drops out, the other still answers", async () => {
  const refused = countingAdapter("yataxi:courier", COURIER_LIMITS);
  const allowed = countingAdapter("cdek:delivery", { maxWeightKg: 50 });

  const result = await listOffersForOrderAdapters(
    input({ weightG: 15_000 }),
    withCreds([refused.adapter, allowed.adapter]),
  );

  assert.equal(refused.calls.count, 0);
  assert.equal(allowed.calls.count, 1);
  assert.deepEqual(result.adapters, [
    { key: "yataxi:courier", status: "parcel_too_large" },
    { key: "cdek:delivery", status: "ok" },
  ]);
  assert.equal(result.offers.length, 1);
});

// ── the insurmountable reason wins over the fixable one ────────────────────
// A service that cannot deliver to a pickup point at all will never appear on
// that route, whatever the parcel weighs. Reporting «too large» first would
// send the seller to shrink a parcel for nothing.

/** @param {string} key @param {OrderAdapter["parcelLimits"]} parcelLimits */
function pointBlindAdapter(key, parcelLimits) {
  const made = countingAdapter(key, parcelLimits);
  return {
    adapter: { ...made.adapter, servesPointDestination: false },
    calls: made.calls,
  };
}

test("heavy parcel to a ПВЗ: a service that cannot serve points answers for itself", async () => {
  const { adapter, calls } = pointBlindAdapter("yataxi:courier", COURIER_LIMITS);

  const result = await listOffersForOrderAdapters(
    input({ weightG: 15_000, pointOutId: "station-uuid" }),
    withCreds([adapter]),
  );

  assert.equal(calls.count, 1, "the adapter must give its own destination refusal");
  assert.notEqual(
    result.adapters[0].status,
    "parcel_too_large",
    "size must not pre-empt the reason the service can never serve this route",
  );
});

test("heavy parcel to a DOOR address: the same service is still filtered on size", async () => {
  const { adapter, calls } = pointBlindAdapter("yataxi:courier", COURIER_LIMITS);

  const result = await listOffersForOrderAdapters(
    input({ weightG: 15_000 }),
    withCreds([adapter]),
  );

  assert.equal(calls.count, 0);
  assert.deepEqual(result.adapters, [
    { key: "yataxi:courier", status: "parcel_too_large" },
  ]);
});

test("a service that CAN serve points is still filtered on size at a ПВЗ", async () => {
  const { adapter, calls } = countingAdapter("yataxi:next_day", {
    maxWeightKg: 30,
  });

  const result = await listOffersForOrderAdapters(
    input({ weightG: 35_000, pointOutId: "station-uuid" }),
    withCreds([adapter]),
  );

  assert.equal(calls.count, 0);
  assert.deepEqual(result.adapters, [
    { key: "yataxi:next_day", status: "parcel_too_large" },
  ]);
});

test("point-only limits do not filter a door delivery", async () => {
  const { adapter, calls } = countingAdapter("yataxi:next_day", {
    maxWeightKg: 30,
  });
  const pointOnly = { ...adapter, parcelLimitsPointOnly: true };

  const result = await listOffersForOrderAdapters(
    input({ weightG: 35_000 }),
    withCreds([pointOnly]),
  );

  assert.equal(calls.count, 1, "door destinations are unfiltered by design");
  assert.deepEqual(result.adapters, [{ key: "yataxi:next_day", status: "ok" }]);
});
