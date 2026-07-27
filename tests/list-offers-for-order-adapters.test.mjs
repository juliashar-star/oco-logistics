import assert from "node:assert/strict";
import test from "node:test";

import { CarrierAuthError } from "../packages/core/src/carrier-adapter/errors.ts";
import { listOffersForOrderAdapters } from "../packages/core/src/carrier-adapter/list-offers-for-order-adapters.ts";

/** @typedef {import("../packages/core/src/carrier-adapter/order-adapters.ts").OrderAdapter} OrderAdapter */
/** @typedef {import("../packages/core/src/carrier-adapter/types.ts").CarrierOffer} CarrierOffer */
/** @typedef {import("../packages/core/src/carrier-adapter/types.ts").CarrierCreateOrderInput} CarrierCreateOrderInput */

const INPUT = /** @type {CarrierCreateOrderInput} */ ({
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
  items: [{ name: "Посылка", quantity: 1, unitPriceRub: 100, weightG: 500 }],
});

const CREDS = { token: "t", platformStationId: "station" };

/**
 * @param {string} key
 * @param {OrderAdapter["getOffers"]} getOffers
 * @returns {OrderAdapter}
 */
function fakeAdapter(key, getOffers) {
  return {
    key,
    providerKey: "yataxi",
    title: key,
    getOffers,
    confirmOffer: async () => {
      throw new Error("confirmOffer must not be called");
    },
    cancelOrder: async () => {
      throw new Error("cancelOrder must not be called");
    },
  };
}

/** @returns {CarrierOffer} */
function makeOffer(offerId) {
  return {
    offerId,
    expiresAt: "2099-01-01T00:00:00Z",
    deliveryIntervalFrom: "2099-01-02T00:00:00Z",
    deliveryIntervalTo: "2099-01-02T12:00:00Z",
    pickupIntervalFrom: "2099-01-01T00:00:00Z",
    pickupIntervalTo: "2099-01-01T12:00:00Z",
    priceRub: 300,
  };
}

test("all ok → offers tagged with each adapter key", async () => {
  const result = await listOffersForOrderAdapters(
    INPUT,
    CREDS,
    [
      fakeAdapter("a:one", async () => ({
        ok: true,
        offers: [makeOffer("o-a")],
      })),
      fakeAdapter("b:two", async () => ({
        ok: true,
        offers: [makeOffer("o-b")],
      })),
    ],
  );

  assert.deepEqual(
    result.offers.map((o) => ({ id: o.offerId, key: o.adapterKey })),
    [
      { id: "o-a", key: "a:one" },
      { id: "o-b", key: "b:two" },
    ],
  );
  assert.deepEqual(result.adapters, [
    { key: "a:one", status: "ok" },
    { key: "b:two", status: "ok" },
  ]);
});

test("merged offers from two adapters return soonest-deadline-first (not registry order)", async () => {
  const nextDayCheap = {
    ...makeOffer("next-day-cheap"),
    deliveryIntervalTo: "2026-07-28T18:00:00Z",
    priceRub: 200,
  };
  const sameDayExpensive = {
    ...makeOffer("same-day-expensive"),
    deliveryIntervalTo: "2026-07-27T16:00:00Z",
    priceRub: 500,
  };
  const sameDayCheap = {
    ...makeOffer("same-day-cheap"),
    deliveryIntervalTo: "2026-07-27T20:00:00Z",
    priceRub: 350,
  };

  const result = await listOffersForOrderAdapters(INPUT, CREDS, [
    fakeAdapter("yataxi:next_day", async () => ({
      ok: true,
      offers: [nextDayCheap],
    })),
    fakeAdapter("yataxi:express", async () => ({
      ok: true,
      offers: [sameDayExpensive, sameDayCheap],
    })),
  ]);

  assert.deepEqual(
    result.offers.map((o) => o.offerId),
    ["same-day-expensive", "same-day-cheap", "next-day-cheap"],
  );
  assert.deepEqual(result.adapters, [
    { key: "yataxi:next_day", status: "ok" },
    { key: "yataxi:express", status: "ok" },
  ]);
});

test("one no_delivery_options → that status, no offers from it", async () => {
  const result = await listOffersForOrderAdapters(INPUT, CREDS, [
    fakeAdapter("solo", async () => ({
      ok: false,
      reason: "no_delivery_options",
    })),
  ]);

  assert.deepEqual(result.offers, []);
  assert.deepEqual(result.adapters, [
    { key: "solo", status: "no_delivery_options" },
  ]);
});

test("one throws → failed status, never rethrows; status has no provider text", async () => {
  const result = await listOffersForOrderAdapters(INPUT, CREDS, [
    fakeAdapter("boom", async () => {
      throw new Error("PROVIDER_SECRET_FAULT_xyz_raw_body");
    }),
  ]);

  assert.deepEqual(result.offers, []);
  assert.deepEqual(result.adapters, [{ key: "boom", status: "failed" }]);
  assert.equal(
    JSON.stringify(result.adapters).includes("PROVIDER_SECRET"),
    false,
  );
});

test("one times out → timed_out", async () => {
  const result = await listOffersForOrderAdapters(
    INPUT,
    CREDS,
    [
      fakeAdapter(
        "slow",
        () =>
          new Promise(() => {
            /* never settles */
          }),
      ),
    ],
    { timeoutMs: 20 },
  );

  assert.deepEqual(result.offers, []);
  assert.deepEqual(result.adapters, [{ key: "slow", status: "timed_out" }]);
});

test("two adapters: one fails, the other returns offers → offers still come back", async () => {
  const result = await listOffersForOrderAdapters(INPUT, CREDS, [
    fakeAdapter("bad", async () => {
      throw new CarrierAuthError("auth boom with raw body");
    }),
    fakeAdapter("good", async () => ({
      ok: true,
      offers: [makeOffer("kept")],
    })),
  ]);

  assert.equal(result.offers.length, 1);
  assert.equal(result.offers[0].offerId, "kept");
  assert.equal(result.offers[0].adapterKey, "good");
  assert.deepEqual(result.adapters, [
    { key: "bad", status: "auth_failed" },
    { key: "good", status: "ok" },
  ]);
});

test("each adapter getOffers receives that adapter's own providerKey", async () => {
  /** @type {string[]} */
  const seen = [];
  const a = {
    ...fakeAdapter("a:one", async (input) => {
      seen.push(input.providerKey);
      return { ok: true, offers: [makeOffer("o-a")] };
    }),
    providerKey: "carrier-a",
  };
  const b = {
    ...fakeAdapter("b:two", async (input) => {
      seen.push(input.providerKey);
      return { ok: true, offers: [makeOffer("o-b")] };
    }),
    providerKey: "carrier-b",
  };

  await listOffersForOrderAdapters(INPUT, CREDS, [a, b]);
  assert.deepEqual(seen.sort(), ["carrier-a", "carrier-b"]);
});

test("console.error never receives recipient PII from INPUT", async () => {
  const calls = [];
  const original = console.error;
  console.error = (...args) => {
    calls.push(args);
  };
  try {
    await listOffersForOrderAdapters(INPUT, CREDS, [
      fakeAdapter("boom", async () => {
        throw new Error("benign adapter fault");
      }),
    ]);
  } finally {
    console.error = original;
  }

  const blob = calls.map((args) => JSON.stringify(args)).join("\n");
  assert.equal(blob.includes(INPUT.recipient.contactName), false);
  assert.equal(blob.includes(INPUT.recipient.phone), false);
  assert.equal(blob.includes(INPUT.recipient.addressString), false);
});
