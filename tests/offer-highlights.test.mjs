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

test("equal prices → BOTH get «дешевле»; the deadline does not enter a price badge", () => {
  const map = offerHighlights([
    dayed("slow", 400, "2026-08-26"),
    dayed("quick", 400, "2026-08-22"),
  ]);
  // Until 25.08 «дешевле» went to the faster of the two. A word about price
  // decided by time is the sin this rewrite removes.
  assert.ok(tagsOf(map, "quick").includes("cheaper"));
  assert.ok(tagsOf(map, "slow").includes("cheaper"));
  // Speed is still said separately, and only about the one that has it.
  assert.ok(tagsOf(map, "quick").includes("faster"));
  assert.equal(tagsOf(map, "slow").includes("faster"), false);
});

test("equal prices and equal speed → BOTH get «дешевле», in either input order", () => {
  const offers = [
    dayed("first", 400, "2026-08-22"),
    dayed("second", 400, "2026-08-22"),
  ];
  // Was «the first listed, stably» until 24.08. Two rows a seller cannot tell
  // apart must not wear different badges, so position no longer decides.
  const map = offerHighlights(offers);
  assert.ok(tagsOf(map, "first").includes("cheaper"));
  assert.ok(tagsOf(map, "second").includes("cheaper"));
  const reversed = offerHighlights([...offers].reverse());
  assert.ok(tagsOf(reversed, "first").includes("cheaper"));
  assert.ok(tagsOf(reversed, "second").includes("cheaper"));
});

test("equal deadlines → BOTH get «быстрее»; the price does not enter a speed badge", () => {
  const map = offerHighlights([
    timed("dear", 900, "2026-08-20T09:00:00.000Z"),
    timed("cheap", 100, "2026-08-20T09:00:00.000Z"),
  ]);
  // Until 25.08 the cheaper one took «быстрее» — a claim about speed settled
  // on cost, with nothing on screen saying so.
  assert.ok(tagsOf(map, "cheap").includes("faster"));
  assert.ok(tagsOf(map, "dear").includes("faster"));
  // The cheapest IS among the fastest here, so the third badge stays away.
  assert.equal(tagsOf(map, "cheap").includes("cheapest_of_fastest"), false);
  assert.equal(tagsOf(map, "dear").includes("cheapest_of_fastest"), false);
});

test("equal deadlines and equal prices → BOTH get both badges; position decides nothing", () => {
  const map = offerHighlights([
    timed("first", 400, "2026-08-20T09:00:00.000Z"),
    timed("second", 400, "2026-08-20T09:00:00.000Z"),
  ]);
  assert.deepEqual(tagsOf(map, "first").sort(), ["cheaper", "faster"]);
  assert.deepEqual(tagsOf(map, "second").sort(), ["cheaper", "faster"]);
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

test("there are exactly three tags — and «оптимально» is still not one of them", () => {
  assert.deepEqual(Object.keys(OFFER_HIGHLIGHT_LABELS).sort(), [
    "cheaper",
    "cheapest_of_fastest",
    "faster",
  ]);
});

// ── «дешевле» is a function of (price, deadline), never of position ─────────

test("several offers at the minimum price AND the same deadline are ALL badged", () => {
  const map = offerHighlights([
    dayed("min-1", 400, "2026-08-22"),
    dayed("min-2", 400, "2026-08-22"),
    dayed("min-3", 400, "2026-08-22"),
    dayed("dearer", 900, "2026-08-22"),
  ]);
  for (const id of ["min-1", "min-2", "min-3"]) {
    assert.ok(tagsOf(map, id).includes("cheaper"), id);
  }
  assert.equal(tagsOf(map, "dearer").includes("cheaper"), false);
});

test("a minimum-price offer with a LATER deadline is STILL «дешевле» — the word claims price only", () => {
  const map = offerHighlights([
    dayed("min-soon-a", 400, "2026-08-22"),
    dayed("min-soon-b", 400, "2026-08-22"),
    dayed("min-later", 400, "2026-08-26"),
  ]);
  // Yesterday's rule withheld the badge here. It was wrong: arriving later
  // does not make an offer less cheap.
  assert.ok(tagsOf(map, "min-soon-a").includes("cheaper"));
  assert.ok(tagsOf(map, "min-soon-b").includes("cheaper"));
  assert.ok(tagsOf(map, "min-later").includes("cheaper"));
  // Speed is where they differ, and that is where they are told apart.
  assert.ok(tagsOf(map, "min-soon-a").includes("faster"));
  assert.ok(tagsOf(map, "min-soon-b").includes("faster"));
  assert.equal(tagsOf(map, "min-later").includes("faster"), false);
});

test("a lone minimum is still badged alone", () => {
  const map = offerHighlights([
    dayed("only-min", 100, "2026-08-26"),
    dayed("dearer-1", 400, "2026-08-22"),
    dayed("dearer-2", 400, "2026-08-22"),
  ]);
  assert.ok(tagsOf(map, "only-min").includes("cheaper"));
  assert.equal(tagsOf(map, "dearer-1").includes("cheaper"), false);
  assert.equal(tagsOf(map, "dearer-2").includes("cheaper"), false);
});

test("EVERY offer sharing price and deadline → every one badged, no suppression", () => {
  // Deliberately not hidden. Suppressing the badge on an all-equal list would
  // make it depend on a stranger: one expensive offer appearing would pop the
  // badge onto all four, though none of them changed.
  const ids = ["a", "b", "c", "d"];
  const map = offerHighlights(ids.map((id) => dayed(id, 250, "2026-08-23")));
  for (const id of ids) {
    assert.ok(tagsOf(map, id).includes("cheaper"), id);
  }
});

test("reversing the input changes no «дешевле» badge at all", () => {
  const offers = [
    dayed("cheap-soon-1", 400, "2026-08-22"),
    dayed("cheap-soon-2", 400, "2026-08-22"),
    dayed("cheap-late", 400, "2026-08-26"),
    timed("dear-soonest", 900, "2026-08-21T09:00:00+03:00"),
  ];
  const cheaperIds = (list) =>
    [...offerHighlights(list).entries()]
      .filter(([, tags]) => tags.includes("cheaper"))
      .map(([id]) => id)
      .sort();
  // cheap-late is at the minimum price too, and now says so.
  const expected = ["cheap-late", "cheap-soon-1", "cheap-soon-2"];
  assert.deepEqual(cheaperIds(offers), expected);
  assert.deepEqual(cheaperIds([...offers].reverse()), expected);
});

// ── «быстрее» is the whole tie ─────────────────────────────────────────────

test("several offers tying on the best deadline are ALL badged «быстрее»", () => {
  const map = offerHighlights([
    dayed("tie-1", 400, "2026-08-22"),
    dayed("tie-2", 500, "2026-08-22"),
    dayed("tie-3", 600, "2026-08-22"),
    dayed("later", 700, "2026-08-26"),
  ]);
  for (const id of ["tie-1", "tie-2", "tie-3"]) {
    assert.ok(tagsOf(map, id).includes("faster"), id);
  }
  assert.equal(tagsOf(map, "later").includes("faster"), false);
});

test("a CDEK-shaped list — calendar days only, no clock times — badges the whole day tie", () => {
  // Every CDEK offer has blank intervals, so the narrowing step can never run:
  // whatever shares the earliest day stays in the tie. This is the ordinary
  // shape of a CDEK list, not an edge case.
  const map = offerHighlights([
    dayed("cdek-a", 411, "2026-08-22"),
    dayed("cdek-b", 523, "2026-08-22"),
    dayed("cdek-c", 640, "2026-08-22"),
    dayed("cdek-d", 388, "2026-08-22"),
    dayed("cdek-e", 299, "2026-08-27"),
  ]);
  for (const id of ["cdek-a", "cdek-b", "cdek-c", "cdek-d"]) {
    assert.ok(tagsOf(map, id).includes("faster"), id);
  }
  assert.equal(tagsOf(map, "cdek-e").includes("faster"), false);
  assert.ok(tagsOf(map, "cdek-e").includes("cheaper"));
});

// ── «дешевле из быстрых» ───────────────────────────────────────────────────

test("the third badge appears when the cheapest is SLOW and the fastest differ in price", () => {
  const map = offerHighlights([
    dayed("fast-mid", 500, "2026-08-22"),
    dayed("fast-dear", 700, "2026-08-22"),
    dayed("slow-cheap", 300, "2026-08-26"),
  ]);
  assert.deepEqual(tagsOf(map, "slow-cheap"), ["cheaper"]);
  assert.deepEqual(tagsOf(map, "fast-mid").sort(), [
    "cheapest_of_fastest",
    "faster",
  ]);
  assert.deepEqual(tagsOf(map, "fast-dear"), ["faster"]);
});

test("the third badge does NOT appear when the cheapest is among the fastest", () => {
  const map = offerHighlights([
    dayed("fast-cheap", 300, "2026-08-22"),
    dayed("fast-dear", 700, "2026-08-22"),
    dayed("slow", 900, "2026-08-26"),
  ]);
  assert.deepEqual(tagsOf(map, "fast-cheap").sort(), ["cheaper", "faster"]);
  assert.deepEqual(tagsOf(map, "fast-dear"), ["faster"]);
  assert.deepEqual(tagsOf(map, "slow"), []);
  for (const id of ["fast-cheap", "fast-dear", "slow"]) {
    assert.equal(tagsOf(map, id).includes("cheapest_of_fastest"), false, id);
  }
});

test("the third badge does NOT appear when every fastest offer shares one price", () => {
  // Condition (b). Without it this set would equal «быстрее» exactly, and the
  // second badge would restate the first on the same two cards.
  const map = offerHighlights([
    dayed("fast-a", 500, "2026-08-22"),
    dayed("fast-b", 500, "2026-08-22"),
    dayed("slow-cheap", 300, "2026-08-26"),
  ]);
  assert.deepEqual(tagsOf(map, "fast-a"), ["faster"]);
  assert.deepEqual(tagsOf(map, "fast-b"), ["faster"]);
  assert.deepEqual(tagsOf(map, "slow-cheap"), ["cheaper"]);
});

test("a single fastest offer never gets the third badge — it would speak about a set of one", () => {
  const map = offerHighlights([
    timed("only-fast", 890, "2026-08-20T15:00:00+03:00"),
    dayed("slow-cheap", 157.5, "2026-08-24"),
  ]);
  assert.deepEqual(tagsOf(map, "only-fast"), ["faster"]);
  assert.deepEqual(tagsOf(map, "slow-cheap"), ["cheaper"]);
});

// ── order independence, across all three badges ────────────────────────────

test("reversing the input changes NO badge of any kind", () => {
  const offers = [
    dayed("fast-mid", 500, "2026-08-22"),
    dayed("fast-dear", 700, "2026-08-22"),
    dayed("fast-mid-twin", 500, "2026-08-22"),
    dayed("slow-cheap", 300, "2026-08-26"),
  ];
  const snapshot = (list) =>
    [...offerHighlights(list).entries()]
      .map(([id, tags]) => [id, [...tags].sort()])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  assert.deepEqual(snapshot(offers), snapshot([...offers].reverse()));
  assert.deepEqual(snapshot(offers), [
    ["fast-dear", ["faster"]],
    ["fast-mid", ["cheapest_of_fastest", "faster"]],
    ["fast-mid-twin", ["cheapest_of_fastest", "faster"]],
    ["slow-cheap", ["cheaper"]],
  ]);
});

test("the third badge wording, character for character", () => {
  assert.equal(
    OFFER_HIGHLIGHT_LABELS.cheapest_of_fastest,
    "дешевле из быстрых",
  );
  assert.equal(OFFER_HIGHLIGHT_LABELS.cheapest_of_fastest[0], "д");
});

test("a MIXED leading day: the CDEK row and the Yandex row both get «быстрее»", () => {
  // The most structural case of the two families meeting. CDEK fills only
  // deliveryDayTo and leaves the intervals blank (map-cdek-tariffs.ts hardcodes
  // them to ""); Yandex fills only the interval. When they share the leading
  // Moscow day, the hour-narrowing step CANNOT RUN — it needs every leader to
  // carry a time — so naming an hour buys the Yandex row no advantage, and the
  // tie stands at the day.
  //
  // This is a consequence of never inventing an hour for a day range, not an
  // accident of the implementation: giving the CDEK row a fabricated midnight
  // or end-of-day would decide the badge on a number the carrier never sent.
  // Both granularities are MEASURED, one per family, not assumed.
  const map = offerHighlights([
    dayed("cdek-day", 500, "2026-08-22"),
    timed("yandex-timed", 700, "2026-08-22T14:00:00+03:00"),
  ]);
  assert.ok(tagsOf(map, "cdek-day").includes("faster"));
  assert.ok(tagsOf(map, "yandex-timed").includes("faster"));
  // The cheaper of the two is among the fastest, so no third badge anywhere.
  assert.deepEqual(tagsOf(map, "cdek-day").sort(), ["cheaper", "faster"]);
  assert.deepEqual(tagsOf(map, "yandex-timed"), ["faster"]);
});

// ── the min-without-max shape ──────────────────────────────────────────────
// A CDEK row can name a start day and no end day, and comparableOfferDeadlines
// falls back to deliveryDayFrom for exactly that. None of the helpers above
// builds it, so until now this module had no coverage of the field at all and
// depended on another suite to notice — which is how a caller that dropped it
// went unseen.

/** A CDEK-shaped offer with only a START day: max blank, min set. */
const dayedFromOnly = (offerId, priceRub, dayFrom) => ({
  offerId,
  priceRub,
  deliveryIntervalTo: "",
  deliveryDayTo: "",
  deliveryDayFrom: dayFrom,
});

test("an offer with only deliveryDayFrom still has a deadline and can win «быстрее»", () => {
  const map = offerHighlights([
    dayedFromOnly("early", 900, "2026-08-22"),
    dayedFromOnly("late", 100, "2026-08-26"),
  ]);
  assert.ok(
    tagsOf(map, "early").includes("faster"),
    "the start-day fallback must produce a usable deadline",
  );
  assert.equal(tagsOf(map, "late").includes("faster"), false);
  // And price still decides «дешевле» independently of the deadline.
  assert.ok(tagsOf(map, "late").includes("cheaper"));
});
