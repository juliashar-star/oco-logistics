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

test("same day, EVERY offer timed → the hour decides, even against the price", () => {
  // Prices deliberately contradict the times: the earlier offer is the DEARER
  // one. Only a comparison by hour can put it first, so this pins rule 2 in the
  // positive direction — when every offer on the leading day carries an hour,
  // the hour is used. With the prices agreeing, as they did until 25.08, a
  // day-only rule would have passed this test too.
  const sameDay = offer({
    offerId: "express-late",
    deliveryIntervalTo: "2026-07-27T18:00:00Z",
    priceRub: 450,
  });
  const nextDay = offer({
    offerId: "next-day",
    deliveryIntervalTo: "2026-07-28T18:00:00Z",
    priceRub: 200,
  });
  const sameDayEarlier = offer({
    offerId: "express-early",
    deliveryIntervalTo: "2026-07-27T14:00:00Z",
    priceRub: 500,
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

test("an offer quoted as a day is placed on that day, not dumped at the end", () => {
  const dayOffer = offer({
    offerId: "day",
    deliveryIntervalTo: "",
    deliveryDayTo: "2026-07-28",
    priceRub: 900,
  });
  const unknown = offer({
    offerId: "unknown",
    deliveryIntervalTo: "",
    priceRub: 1,
  });

  const sorted = sortOffersForSeller([unknown, dayOffer]);
  assert.deepEqual(
    sorted.map((o) => o.offerId),
    ["day", "unknown"],
  );
});

test("a day range and a clock time on the SAME day tie; the price then decides", () => {
  // The day offer is the CHEAPER one, so the two rules disagree and the test
  // can tell them apart. Substituting the end of the Moscow day for the range —
  // as the sorter did until 25.08 — put the timed offer first whatever the
  // prices were. Comparing at the precision the two share leaves them tied on
  // the day, and the cheaper one wins.
  const dayOffer = offer({
    offerId: "day",
    deliveryIntervalTo: "",
    deliveryDayTo: "2026-07-28",
    priceRub: 100,
  });
  const earlier = offer({
    offerId: "yandex-earlier",
    deliveryIntervalTo: "2026-07-28T12:00:00Z",
    priceRub: 400,
  });
  const later = offer({
    offerId: "yandex-later",
    deliveryIntervalTo: "2026-07-29T12:00:00Z",
    priceRub: 300,
  });

  const sorted = sortOffersForSeller([later, dayOffer, earlier]);
  assert.deepEqual(
    sorted.map((o) => o.offerId),
    ["day", "yandex-earlier", "yandex-later"],
  );

  const reversed = sortOffersForSeller([earlier, later, dayOffer]);
  assert.deepEqual(
    reversed.map((o) => o.offerId),
    ["day", "yandex-earlier", "yandex-later"],
  );
});

test("deliveryDayFrom used when deliveryDayTo is absent", () => {
  const fromOnly = offer({
    offerId: "from-only",
    deliveryIntervalTo: "",
    deliveryDayFrom: "2026-07-28",
    priceRub: 500,
  });
  const earlier = offer({
    offerId: "yandex-earlier",
    deliveryIntervalTo: "2026-07-28T12:00:00Z",
    priceRub: 400,
  });
  const later = offer({
    offerId: "yandex-later",
    deliveryIntervalTo: "2026-07-29T12:00:00Z",
    priceRub: 300,
  });

  const sorted = sortOffersForSeller([later, fromOnly, earlier]);
  assert.deepEqual(
    sorted.map((o) => o.offerId),
    ["yandex-earlier", "from-only", "yandex-later"],
  );
});

test("blank interval and no day fields still sort last", () => {
  const known = offer({
    offerId: "known",
    deliveryIntervalTo: "2026-07-28T12:00:00Z",
    priceRub: 900,
  });
  const blank = offer({
    offerId: "blank",
    deliveryIntervalTo: "",
    priceRub: 1,
  });

  const sorted = sortOffersForSeller([blank, known]);
  assert.deepEqual(
    sorted.map((o) => o.offerId),
    ["known", "blank"],
  );
});

// The masking scope, pinned from both sides. These two differ only in WHICH day
// the day-only offer lands on, and they must come out differently.

test("a day-only offer on the LEADING day masks the hour there: the timed pair falls back to price", () => {
  // The accepted cost, made visible. yandex-early genuinely arrives sooner, but
  // once a CDEK row shares its day the hour is no longer a shared unit, and the
  // three are ordered by price. Naming this in a test is cheaper than
  // rediscovering it on a screen.
  const yandexEarly = offer({
    offerId: "yandex-early",
    deliveryIntervalTo: "2026-07-28T09:00:00Z",
    priceRub: 900,
  });
  const yandexLate = offer({
    offerId: "yandex-late",
    deliveryIntervalTo: "2026-07-28T18:00:00Z",
    priceRub: 100,
  });
  const cdekSameDay = offer({
    offerId: "cdek-same-day",
    deliveryIntervalTo: "",
    deliveryDayTo: "2026-07-28",
    priceRub: 500,
  });

  const sorted = sortOffersForSeller([yandexEarly, cdekSameDay, yandexLate]);
  assert.deepEqual(
    sorted.map((o) => o.offerId),
    ["yandex-late", "cdek-same-day", "yandex-early"],
  );
});

test("a day-only offer on a LATER day masks nothing: the timed pair keeps its hour order", () => {
  // Scope is the day, not the list. If the mask were computed over the whole
  // list, this CDEK row on the 29th would strip the hour from the two Yandex
  // rows on the 28th and reorder them by price — and it would also change which
  // offers the badges call fastest, which this slice must not do.
  const yandexEarly = offer({
    offerId: "yandex-early",
    deliveryIntervalTo: "2026-07-28T09:00:00Z",
    priceRub: 900,
  });
  const yandexLate = offer({
    offerId: "yandex-late",
    deliveryIntervalTo: "2026-07-28T18:00:00Z",
    priceRub: 100,
  });
  const cdekLaterDay = offer({
    offerId: "cdek-later-day",
    deliveryIntervalTo: "",
    deliveryDayTo: "2026-07-29",
    priceRub: 50,
  });

  const sorted = sortOffersForSeller([yandexLate, cdekLaterDay, yandexEarly]);
  assert.deepEqual(
    sorted.map((o) => o.offerId),
    ["yandex-early", "yandex-late", "cdek-later-day"],
  );
});
