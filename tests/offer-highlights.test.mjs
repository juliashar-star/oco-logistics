import assert from "node:assert/strict";
import test from "node:test";

import {
  OFFER_HIGHLIGHT_LABELS,
  offerHighlights,
} from "../apps/web/lib/shipments/offer-highlights.ts";

/** A Yandex-shaped offer: timed interval, no day fields. */
const timed = (offerId, priceRub, isoTo) => ({
  offerId,
  priceRub,
  deliveryIntervalTo: isoTo,
  deliveryDayTo: "",
});

/** A CDEK-shaped offer: calendar day range, no clock time. */
const dayed = (offerId, priceRub, dayTo) => ({
  offerId,
  priceRub,
  deliveryIntervalTo: "",
  deliveryDayTo: dayTo,
});

const tagsOf = (map, offerId) => map.get(offerId) ?? [];

// ── prices alone ───────────────────────────────────────────────────────────

test("cheapest of two priced offers gets «дешевле»", () => {
  const map = offerHighlights([
    dayed("a", 500, "2026-08-20"),
    dayed("b", 300, "2026-08-20"),
  ]);
  assert.ok(tagsOf(map, "b").includes("cheaper"));
  assert.equal(tagsOf(map, "a").includes("cheaper"), false);
});

test("no offer without a deadline and no price comparison → nothing at all", () => {
  const map = offerHighlights([
    { offerId: "a", priceRub: Number.NaN, deliveryIntervalTo: "", deliveryDayTo: "" },
    { offerId: "b", priceRub: Number.NaN, deliveryIntervalTo: "", deliveryDayTo: "" },
  ]);
  assert.equal(map.size, 0);
});

// ── days alone ─────────────────────────────────────────────────────────────

test("earlier calendar day gets «быстрее»", () => {
  const map = offerHighlights([
    dayed("late", 100, "2026-08-26"),
    dayed("early", 900, "2026-08-22"),
  ]);
  assert.ok(tagsOf(map, "early").includes("faster"));
  assert.equal(tagsOf(map, "late").includes("faster"), false);
  // and the cheap tag went the other way
  assert.ok(tagsOf(map, "late").includes("cheaper"));
});

// ── times alone ────────────────────────────────────────────────────────────

test("earlier clock time on the same day gets «быстрее»", () => {
  const map = offerHighlights([
    timed("evening", 100, "2026-08-20T18:00:00.000Z"),
    timed("morning", 900, "2026-08-20T09:00:00.000Z"),
  ]);
  assert.ok(tagsOf(map, "morning").includes("faster"));
  assert.ok(tagsOf(map, "evening").includes("cheaper"));
});

test("the LATE edge decides, not the early one", () => {
  // «wide» starts earlier but ends later; a seller can only rely on the end.
  const wide = {
    offerId: "wide",
    priceRub: 500,
    deliveryIntervalTo: "2026-08-20T21:00:00.000Z",
    deliveryDayTo: "",
  };
  const narrow = {
    offerId: "narrow",
    priceRub: 500,
    deliveryIntervalTo: "2026-08-20T12:00:00.000Z",
    deliveryDayTo: "",
  };
  const map = offerHighlights([wide, narrow]);
  assert.ok(tagsOf(map, "narrow").includes("faster"));
  assert.equal(tagsOf(map, "wide").includes("faster"), false);
});

// ── mixed families: a day range against a clock time ───────────────────────

test("mixed families compare BY DAY: a later day loses even with a clock time", () => {
  const map = offerHighlights([
    timed("timed-21", 900, "2026-08-21T06:00:00.000Z"),
    dayed("dayed-20", 100, "2026-08-20"),
  ]);
  assert.ok(tagsOf(map, "dayed-20").includes("faster"));
  assert.equal(tagsOf(map, "timed-21").includes("faster"), false);
});

test("NO HOUR IS EVER INVENTED FOR A DAY RANGE: the clock time cannot break a same-day tie against it", () => {
  // Same Moscow calendar day on both sides. If the code gave the day range an
  // hour (midnight, noon, end of day — any of them), the timed offer would win
  // or lose by that fabricated number. Instead the day is all they share, so
  // the tie falls through to price — and the answer must not change when the
  // timed offer moves around inside that day.
  const early = offerHighlights([
    timed("timed", 900, "2026-08-20T00:30:00+03:00"),
    dayed("dayed", 100, "2026-08-20"),
  ]);
  const late = offerHighlights([
    timed("timed", 900, "2026-08-20T23:30:00+03:00"),
    dayed("dayed", 100, "2026-08-20"),
  ]);
  assert.deepEqual(tagsOf(early, "dayed"), tagsOf(late, "dayed"));
  assert.deepEqual(tagsOf(early, "timed"), tagsOf(late, "timed"));
  // Cheaper wins the same-day tie, both times.
  assert.ok(tagsOf(early, "dayed").includes("faster"));
  assert.ok(tagsOf(late, "dayed").includes("faster"));
});

test("the day of a timed offer is its MOSCOW day, not UTC", () => {
  // 2026-08-20T22:00Z is 2026-08-21 01:00 in Moscow — a later day than the
  // CDEK row, so the CDEK row is faster.
  const map = offerHighlights([
    timed("timed", 500, "2026-08-20T22:00:00.000Z"),
    dayed("dayed", 500, "2026-08-20"),
  ]);
  assert.ok(tagsOf(map, "dayed").includes("faster"));
});

// ── ties ───────────────────────────────────────────────────────────────────

test("equal prices → «дешевле» goes to the faster one", () => {
  const map = offerHighlights([
    dayed("slow", 400, "2026-08-26"),
    dayed("quick", 400, "2026-08-22"),
  ]);
  assert.ok(tagsOf(map, "quick").includes("cheaper"));
  assert.equal(tagsOf(map, "slow").includes("cheaper"), false);
});

test("equal prices and equal speed → the first listed, stably", () => {
  const offers = [
    dayed("first", 400, "2026-08-22"),
    dayed("second", 400, "2026-08-22"),
  ];
  assert.ok(tagsOf(offerHighlights(offers), "first").includes("cheaper"));
  // Reversing the input reverses the winner — the rule is «first listed»,
  // not «whichever id sorts lower».
  assert.ok(
    tagsOf(offerHighlights([...offers].reverse()), "second").includes("cheaper"),
  );
});

test("equal deadlines → «быстрее» goes to the cheaper one", () => {
  const map = offerHighlights([
    timed("dear", 900, "2026-08-20T09:00:00.000Z"),
    timed("cheap", 100, "2026-08-20T09:00:00.000Z"),
  ]);
  assert.ok(tagsOf(map, "cheap").includes("faster"));
  assert.equal(tagsOf(map, "dear").includes("faster"), false);
});

test("equal deadlines and equal prices → the first listed", () => {
  const map = offerHighlights([
    timed("first", 400, "2026-08-20T09:00:00.000Z"),
    timed("second", 400, "2026-08-20T09:00:00.000Z"),
  ]);
  assert.ok(tagsOf(map, "first").includes("faster"));
  assert.equal(tagsOf(map, "second").includes("faster"), false);
});

// ── an offer with no usable deadline ───────────────────────────────────────

for (const [label, offer] of [
  ["both fields blank", { deliveryIntervalTo: "", deliveryDayTo: "" }],
  ["whitespace only", { deliveryIntervalTo: "   ", deliveryDayTo: "  " }],
  ["unparseable ISO", { deliveryIntervalTo: "не дата", deliveryDayTo: "" }],
  ["malformed day", { deliveryIntervalTo: "", deliveryDayTo: "20.08.2026" }],
  ["day with a time glued on", { deliveryIntervalTo: "", deliveryDayTo: "2026-08-20T10:00" }],
]) {
  test(`an offer with ${label} gets no «быстрее» and blocks nobody`, () => {
    const map = offerHighlights([
      { offerId: "broken", priceRub: 100, ...offer },
      dayed("fine", 900, "2026-08-26"),
    ]);
    assert.equal(tagsOf(map, "broken").includes("faster"), false);
    // The other offer still wins its badge — a broken row is not a blocker.
    assert.ok(tagsOf(map, "fine").includes("faster"));
    // …and the broken one is still the cheaper of the two.
    assert.ok(tagsOf(map, "broken").includes("cheaper"));
  });
}

test("nobody has a usable deadline → no «быстрее» anywhere, «дешевле» still works", () => {
  const map = offerHighlights([
    { offerId: "a", priceRub: 500, deliveryIntervalTo: "", deliveryDayTo: "" },
    { offerId: "b", priceRub: 300, deliveryIntervalTo: "", deliveryDayTo: "" },
  ]);
  assert.deepEqual(tagsOf(map, "b"), ["cheaper"]);
  assert.deepEqual(tagsOf(map, "a"), []);
});

// ── list sizes ─────────────────────────────────────────────────────────────

test("a single offer gets no badges — one row is not a comparison", () => {
  assert.equal(offerHighlights([dayed("only", 100, "2026-08-20")]).size, 0);
});

test("an empty list yields an empty map", () => {
  assert.equal(offerHighlights([]).size, 0);
});

// ── one offer can win both ─────────────────────────────────────────────────

test("cheapest AND fastest is one offer with both tags", () => {
  const map = offerHighlights([
    dayed("best", 100, "2026-08-20"),
    dayed("other", 500, "2026-08-26"),
    dayed("third", 700, "2026-08-24"),
  ]);
  assert.deepEqual(tagsOf(map, "best").sort(), ["cheaper", "faster"]);
  assert.deepEqual(tagsOf(map, "other"), []);
  assert.deepEqual(tagsOf(map, "third"), []);
});

test("a realistic mixed list: one carrier cheaper, another faster", () => {
  const map = offerHighlights([
    timed("yandex-fast", 890, "2026-08-20T15:00:00+03:00"),
    dayed("cdek-cheap", 157.5, "2026-08-24"),
    dayed("cdek-mid", 310, "2026-08-22"),
  ]);
  assert.deepEqual(tagsOf(map, "cdek-cheap"), ["cheaper"]);
  assert.deepEqual(tagsOf(map, "yandex-fast"), ["faster"]);
  assert.deepEqual(tagsOf(map, "cdek-mid"), []);
});

// ── wording pin ────────────────────────────────────────────────────────────

test("the badge wording, character for character", () => {
  assert.equal(OFFER_HIGHLIGHT_LABELS.cheaper, "дешевле");
  assert.equal(OFFER_HIGHLIGHT_LABELS.faster, "быстрее");
  // Lowercase, like «предварительная цена» and «без термосумки» beside them.
  assert.equal(OFFER_HIGHLIGHT_LABELS.cheaper[0], "д");
  assert.equal(OFFER_HIGHLIGHT_LABELS.faster[0], "б");
});

test("there are exactly two tags — no «оптимально»", () => {
  assert.deepEqual(Object.keys(OFFER_HIGHLIGHT_LABELS).sort(), [
    "cheaper",
    "faster",
  ]);
});
