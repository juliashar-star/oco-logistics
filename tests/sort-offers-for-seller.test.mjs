import assert from "node:assert/strict";
import test from "node:test";

import { sortOffersForSeller } from "../packages/core/src/carrier-adapter/sort-offers-for-seller.ts";

/** @typedef {import("../packages/core/src/carrier-adapter/types.ts").CarrierOffer} CarrierOffer */

/**
 * @param {Partial<CarrierOffer> & { offerId: string }} patch
 * @returns {CarrierOffer}
 */
function offer(patch) {
  return {
    expiresAt: "2099-01-01T00:00:00Z",
    deliveryIntervalFrom: "2099-01-01T00:00:00Z",
    deliveryIntervalTo: "2099-01-02T12:00:00Z",
    pickupIntervalFrom: "2099-01-01T00:00:00Z",
    pickupIntervalTo: "2099-01-01T12:00:00Z",
    priceRub: 300,
    ...patch,
  };
}

test("empty list returns empty", () => {
  assert.deepEqual(sortOffersForSeller([]), []);
});

test("mixed same-day and next-day → soonest deliveryIntervalTo first", () => {
  const sameDay = offer({
    offerId: "express-late",
    deliveryIntervalTo: "2026-07-27T18:00:00Z",
    priceRub: 500,
  });
  const nextDay = offer({
    offerId: "next-day",
    deliveryIntervalTo: "2026-07-28T18:00:00Z",
    priceRub: 200,
  });
  const sameDayEarlier = offer({
    offerId: "express-early",
    deliveryIntervalTo: "2026-07-27T14:00:00Z",
    priceRub: 450,
  });

  const sorted = sortOffersForSeller([nextDay, sameDay, sameDayEarlier]);
  assert.deepEqual(
    sorted.map((o) => o.offerId),
    ["express-early", "express-late", "next-day"],
  );
});

test("equal deadlines fall back to priceRub ascending", () => {
  const expensive = offer({
    offerId: "b",
    deliveryIntervalTo: "2026-07-28T12:00:00Z",
    priceRub: 400,
  });
  const cheap = offer({
    offerId: "a",
    deliveryIntervalTo: "2026-07-28T12:00:00Z",
    priceRub: 250,
  });

  const sorted = sortOffersForSeller([expensive, cheap]);
  assert.deepEqual(
    sorted.map((o) => o.offerId),
    ["a", "b"],
  );
});

test("equal deadline and price fall back to offerId", () => {
  const mid = offer({
    offerId: "m",
    deliveryIntervalTo: "2026-07-28T12:00:00Z",
    priceRub: 300,
  });
  const late = offer({
    offerId: "z",
    deliveryIntervalTo: "2026-07-28T12:00:00Z",
    priceRub: 300,
  });
  const early = offer({
    offerId: "a",
    deliveryIntervalTo: "2026-07-28T12:00:00Z",
    priceRub: 300,
  });

  const sorted = sortOffersForSeller([mid, late, early]);
  assert.deepEqual(
    sorted.map((o) => o.offerId),
    ["a", "m", "z"],
  );
});

test("blank and unparseable deliveryIntervalTo sort last", () => {
  const known = offer({
    offerId: "known",
    deliveryIntervalTo: "2026-07-28T12:00:00Z",
    priceRub: 900,
  });
  const blank = offer({
    offerId: "blank",
    deliveryIntervalTo: "   ",
    priceRub: 10,
  });
  const bad = offer({
    offerId: "bad",
    deliveryIntervalTo: "not-a-date",
    priceRub: 5,
  });
  const empty = offer({
    offerId: "empty",
    deliveryIntervalTo: "",
    priceRub: 1,
  });

  const sorted = sortOffersForSeller([blank, known, bad, empty]);
  assert.deepEqual(
    sorted.map((o) => o.offerId),
    ["known", "empty", "bad", "blank"],
  );
});

test("does not mutate the input array", () => {
  const a = offer({
    offerId: "later",
    deliveryIntervalTo: "2026-07-29T12:00:00Z",
  });
  const b = offer({
    offerId: "sooner",
    deliveryIntervalTo: "2026-07-27T12:00:00Z",
  });
  const input = [a, b];
  const before = input.slice();

  const sorted = sortOffersForSeller(input);

  assert.notEqual(sorted, input);
  assert.deepEqual(input, before);
  assert.deepEqual(
    sorted.map((o) => o.offerId),
    ["sooner", "later"],
  );
});
