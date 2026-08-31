import test from "node:test";
import assert from "node:assert/strict";

import {
  RULES_VERSION,
  buildShipmentDecision,
} from "../packages/core/src/shipment-decision.ts";

const NOW = new Date("2026-08-31T12:00:00.000Z");

/** Minimal usable offer: an id, an adapter key and a price. */
function offer(overrides) {
  return {
    offerId: "o1",
    adapterKey: "yataxi:next_day",
    priceRub: 500,
    ...overrides,
  };
}

function build(offers, selectedOfferId = "o1") {
  return buildShipmentDecision({
    offers,
    selectedOfferId,
    rulesVersion: RULES_VERSION,
    now: NOW,
  });
}

function decisionOf(offers, selectedOfferId = "o1") {
  const result = build(offers, selectedOfferId);
  assert.equal(result.ok, true, `expected ok, got ${JSON.stringify(result)}`);
  return result.decision;
}

// ---------------------------------------------------------------- date forms

test("calendar-day form: deliveryDayTo gives the day and CALENDAR_DAY basis", () => {
  const d = decisionOf([
    offer({ deliveryDayFrom: "2026-09-01", deliveryDayTo: "2026-09-03" }),
  ]);
  assert.equal(d.chosenDeadlineDay, "2026-09-03");
  assert.equal(d.chosenDeadlineBasis, "CALENDAR_DAY");
});

test("calendar-day form: deliveryDayFrom is the fallback when To is blank", () => {
  const d = decisionOf([
    offer({ deliveryDayFrom: "2026-09-01", deliveryDayTo: "" }),
  ]);
  assert.equal(d.chosenDeadlineDay, "2026-09-01");
  assert.equal(d.chosenDeadlineBasis, "CALENDAR_DAY");
});

test("interval form: an ISO interval normalises to a Moscow calendar day", () => {
  const d = decisionOf([
    offer({
      deliveryDayFrom: "",
      deliveryDayTo: "",
      deliveryIntervalFrom: "2026-09-01T09:00:00+03:00",
      deliveryIntervalTo: "2026-09-01T18:00:00+03:00",
    }),
  ]);
  assert.equal(d.chosenDeadlineDay, "2026-09-01");
  assert.equal(d.chosenDeadlineBasis, "INTERVAL");
});

test("interval form: late edge wins over the early one", () => {
  const d = decisionOf([
    offer({
      deliveryIntervalFrom: "2026-09-01T22:00:00+03:00",
      deliveryIntervalTo: "2026-09-02T10:00:00+03:00",
    }),
  ]);
  assert.equal(d.chosenDeadlineDay, "2026-09-02");
});

test("interval form: a UTC instant late in the day is the NEXT Moscow day", () => {
  const d = decisionOf([
    offer({ deliveryIntervalTo: "2026-09-01T22:30:00.000Z" }),
  ]);
  // 22:30 UTC is 01:30 the following day in Moscow (+03:00).
  assert.equal(d.chosenDeadlineDay, "2026-09-02");
  assert.equal(d.chosenDeadlineBasis, "INTERVAL");
});

test("both date families blank: day and basis are both null, and it still succeeds", () => {
  const d = decisionOf([
    offer({
      deliveryDayFrom: "",
      deliveryDayTo: "",
      deliveryIntervalFrom: "",
      deliveryIntervalTo: "",
    }),
  ]);
  assert.equal(d.chosenDeadlineDay, null);
  assert.equal(d.chosenDeadlineBasis, null);
});

test("both date families absent entirely: same as blank", () => {
  const d = decisionOf([offer({})]);
  assert.equal(d.chosenDeadlineDay, null);
  assert.equal(d.chosenDeadlineBasis, null);
});

test("an unparseable interval is not a crash and not a day", () => {
  const d = decisionOf([offer({ deliveryIntervalTo: "не дата" })]);
  assert.equal(d.chosenDeadlineDay, null);
  assert.equal(d.chosenDeadlineBasis, null);
});

// The precedence is NOT this module's to choose: it comes from
// offer-deadline.ts, the same code the offers screen resolves a day with, so a
// stored decision can never name a day the seller was not shown. An earlier
// revision of this file pinned the OPPOSITE order — day over interval — and
// that rule was withdrawn on 31.08 precisely because it was a second opinion.
test("a usable interval beats a day field — the screen's rule, not ours", () => {
  const d = decisionOf([
    offer({
      deliveryDayTo: "2026-09-05",
      deliveryIntervalTo: "2026-09-01T18:00:00+03:00",
    }),
  ]);
  assert.equal(d.chosenDeadlineDay, "2026-09-01");
  assert.equal(d.chosenDeadlineBasis, "INTERVAL");
});

test("an UNPARSEABLE interval falls through to the day field", () => {
  const d = decisionOf([
    offer({ deliveryIntervalTo: "не дата", deliveryDayTo: "2026-09-05" }),
  ]);
  assert.equal(d.chosenDeadlineDay, "2026-09-05");
  assert.equal(d.chosenDeadlineBasis, "CALENDAR_DAY");
});

test("deliveryIntervalFrom alone yields no day — the shared reader ignores it", () => {
  const d = decisionOf([
    offer({ deliveryIntervalFrom: "2026-09-01T09:00:00+03:00" }),
  ]);
  assert.equal(d.chosenDeadlineDay, null);
  assert.equal(d.chosenDeadlineBasis, null);
});

// ---------------------------------------------------------------- alternative

test("alternative exists: cheaper and same day", () => {
  const d = decisionOf([
    offer({ offerId: "o1", priceRub: 500, deliveryDayTo: "2026-09-03" }),
    offer({
      offerId: "o2",
      adapterKey: "cdek:delivery",
      priceRub: 400,
      deliveryDayTo: "2026-09-03",
    }),
  ]);
  assert.equal(d.altAdapterKey, "cdek:delivery");
  assert.equal(d.altPriceKop, 40000);
  assert.equal(d.altDeadlineDay, "2026-09-03");
});

test("alternative exists: cheaper and EARLIER also qualifies", () => {
  const d = decisionOf([
    offer({ offerId: "o1", priceRub: 500, deliveryDayTo: "2026-09-03" }),
    offer({
      offerId: "o2",
      adapterKey: "cdek:delivery",
      priceRub: 300,
      deliveryDayTo: "2026-09-01",
    }),
  ]);
  assert.equal(d.altPriceKop, 30000);
  assert.equal(d.altDeadlineDay, "2026-09-01");
});

test("no alternative: the cheaper offer arrives LATER", () => {
  const d = decisionOf([
    offer({ offerId: "o1", priceRub: 500, deliveryDayTo: "2026-09-03" }),
    offer({
      offerId: "o2",
      adapterKey: "cdek:delivery",
      priceRub: 400,
      deliveryDayTo: "2026-09-04",
    }),
  ]);
  assert.equal(d.altAdapterKey, null);
  assert.equal(d.altPriceKop, null);
  assert.equal(d.altDeadlineDay, null);
});

test("no alternative: every other offer is more expensive", () => {
  const d = decisionOf([
    offer({ offerId: "o1", priceRub: 400, deliveryDayTo: "2026-09-03" }),
    offer({
      offerId: "o2",
      adapterKey: "cdek:delivery",
      priceRub: 900,
      deliveryDayTo: "2026-09-01",
    }),
  ]);
  assert.equal(d.altAdapterKey, null);
});

test("EQUAL prices are not an alternative — strictly cheaper is required", () => {
  const d = decisionOf([
    offer({ offerId: "o1", priceRub: 500, deliveryDayTo: "2026-09-03" }),
    offer({
      offerId: "o2",
      adapterKey: "cdek:delivery",
      priceRub: 500,
      deliveryDayTo: "2026-09-02",
    }),
  ]);
  assert.equal(d.altAdapterKey, null);
  assert.equal(d.altPriceKop, null);
});

test("the cheapest qualifying offer wins, not merely the first", () => {
  const d = decisionOf([
    offer({ offerId: "o1", priceRub: 900, deliveryDayTo: "2026-09-03" }),
    offer({
      offerId: "o2",
      adapterKey: "cdek:delivery",
      priceRub: 700,
      deliveryDayTo: "2026-09-03",
    }),
    offer({
      offerId: "o3",
      adapterKey: "yataxi:express",
      priceRub: 500,
      deliveryDayTo: "2026-09-02",
    }),
  ]);
  assert.equal(d.altAdapterKey, "yataxi:express");
  assert.equal(d.altPriceKop, 50000);
});

test("a tie on the cheapest price keeps the FIRST in list order", () => {
  const d = decisionOf([
    offer({ offerId: "o1", priceRub: 900, deliveryDayTo: "2026-09-03" }),
    offer({
      offerId: "o2",
      adapterKey: "cdek:delivery",
      priceRub: 400,
      deliveryDayTo: "2026-09-03",
    }),
    offer({
      offerId: "o3",
      adapterKey: "yataxi:express",
      priceRub: 400,
      deliveryDayTo: "2026-09-03",
    }),
  ]);
  assert.equal(d.altAdapterKey, "cdek:delivery");
});

test("no alternative when the CHOSEN offer has no day: not-later is undecidable", () => {
  const d = decisionOf([
    offer({ offerId: "o1", priceRub: 500 }),
    offer({
      offerId: "o2",
      adapterKey: "cdek:delivery",
      priceRub: 300,
      deliveryDayTo: "2026-09-01",
    }),
  ]);
  assert.equal(d.chosenDeadlineDay, null);
  assert.equal(d.altAdapterKey, null);
});

test("a candidate without a day is skipped, a dated one is still found", () => {
  const d = decisionOf([
    offer({ offerId: "o1", priceRub: 500, deliveryDayTo: "2026-09-03" }),
    offer({ offerId: "o2", adapterKey: "cdek:delivery", priceRub: 100 }),
    offer({
      offerId: "o3",
      adapterKey: "yataxi:express",
      priceRub: 400,
      deliveryDayTo: "2026-09-03",
    }),
  ]);
  assert.equal(d.altAdapterKey, "yataxi:express");
  assert.equal(d.altPriceKop, 40000);
});

// ------------------------------------------------------------- attribution

test("attributionComplete is true when every offer carries an adapterKey", () => {
  const d = decisionOf([
    offer({ offerId: "o1" }),
    offer({ offerId: "o2", adapterKey: "cdek:delivery", priceRub: 700 }),
  ]);
  assert.equal(d.attributionComplete, true);
  assert.equal(d.carriersTotal, 2);
  assert.equal(d.offersTotal, 2);
});

test("mixed attribution: one offer without adapterKey makes it false", () => {
  const d = decisionOf([
    offer({ offerId: "o1" }),
    offer({ offerId: "o2", adapterKey: "", priceRub: 700 }),
  ]);
  assert.equal(d.attributionComplete, false);
  assert.equal(d.carriersTotal, 1);
  assert.equal(d.offersTotal, 2);
});

test("adapterKey absent as a key, not merely blank, also counts as missing", () => {
  const d = decisionOf([
    offer({ offerId: "o1" }),
    { offerId: "o2", priceRub: 700 },
  ]);
  assert.equal(d.attributionComplete, false);
  assert.equal(d.carriersTotal, 1);
});

test("all offers without adapterKey: the CHOSEN one cannot be named, so it fails", () => {
  const result = build([
    { offerId: "o1", priceRub: 500 },
    { offerId: "o2", priceRub: 400 },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "selected_offer_has_no_adapter_key");
});

test("carriersTotal counts DISTINCT keys, not offers", () => {
  const d = decisionOf([
    offer({ offerId: "o1" }),
    offer({ offerId: "o2", priceRub: 600 }),
    offer({ offerId: "o3", adapterKey: "cdek:delivery", priceRub: 700 }),
  ]);
  assert.equal(d.offersTotal, 3);
  assert.equal(d.carriersTotal, 2);
});

test("offersTotal is the length AS IS — duplicates are not collapsed", () => {
  const dup = offer({ offerId: "o2", priceRub: 500, deliveryDayTo: "2026-09-03" });
  const d = decisionOf([
    offer({ offerId: "o1", deliveryDayTo: "2026-09-03" }),
    dup,
    { ...dup, offerId: "o3" },
  ]);
  assert.equal(d.offersTotal, 3);
});

// ------------------------------------------------------------------ failures

test("empty array is a named failure, not a throw", () => {
  const result = build([]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "offers_empty");
});

test("a non-array is a named failure, not a throw", () => {
  for (const value of [null, undefined, {}, "offers", 7]) {
    const result = build(value);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "offers_not_an_array");
  }
});

test("selectedOfferId matching nothing is a named failure", () => {
  const result = build([offer({ offerId: "o1" })], "does-not-exist");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "selected_offer_not_found");
});

test("a blank or missing selectedOfferId never matches a blank offerId", () => {
  for (const selected of ["", "   ", null, undefined]) {
    const result = buildShipmentDecision({
      offers: [{ offerId: "", adapterKey: "cdek:delivery", priceRub: 100 }],
      selectedOfferId: selected,
      rulesVersion: RULES_VERSION,
      now: NOW,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "selected_offer_not_found");
  }
});

test("a chosen offer with no usable price is a named failure", () => {
  const result = build([{ offerId: "o1", adapterKey: "cdek:delivery" }]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "selected_offer_has_no_price");
});

test("a non-numeric price is not coerced", () => {
  for (const price of ["500", null, Number.NaN, Infinity]) {
    const result = build([
      { offerId: "o1", adapterKey: "cdek:delivery", priceRub: price },
    ]);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "selected_offer_has_no_price");
  }
});

test("garbage entries inside the array do not throw", () => {
  const d = decisionOf([
    offer({ offerId: "o1", deliveryDayTo: "2026-09-03" }),
    null,
    "nonsense",
    42,
  ]);
  assert.equal(d.offersTotal, 4);
  assert.equal(d.attributionComplete, false);
  assert.equal(d.carriersTotal, 1);
});

// ------------------------------------------------------------ scalar fields

test("scalar fields are copied through, with the estimate flag defaulting to firm", () => {
  const d = decisionOf([
    offer({
      offerId: "o1",
      adapterKey: "cdek:delivery",
      serviceName: "  Посылка склад-склад  ",
      priceRub: 649.4,
      priceIsEstimate: true,
    }),
  ]);
  assert.equal(d.rulesVersion, RULES_VERSION);
  assert.equal(d.decidedAt, NOW);
  assert.equal(d.chosenAdapterKey, "cdek:delivery");
  assert.equal(d.chosenServiceName, "Посылка склад-склад");
  assert.equal(d.chosenPriceKop, 64940);
  assert.equal(d.chosenPriceIsEstimate, true);
});

test("a blank serviceName becomes null, and an absent estimate flag means firm", () => {
  const d = decisionOf([offer({ serviceName: "   " })]);
  assert.equal(d.chosenServiceName, null);
  assert.equal(d.chosenPriceIsEstimate, false);
});

test("prices are KOPECKS, and a fractional ruble amount survives the conversion", () => {
  const d = decisionOf([
    offer({ offerId: "o1", priceRub: 649.4, deliveryDayTo: "2026-09-03" }),
    offer({
      offerId: "o2",
      adapterKey: "cdek:delivery",
      priceRub: 273.28,
      deliveryDayTo: "2026-09-03",
    }),
  ]);
  assert.equal(d.chosenPriceKop, 64940);
  assert.equal(d.altPriceKop, 27328);
});

// ---------------------------------------------- the estimate flag, both sides

test("altPriceIsEstimate is true when the alternative is an estimate", () => {
  const d = decisionOf([
    offer({ offerId: "o1", priceRub: 500, deliveryDayTo: "2026-09-03" }),
    offer({
      offerId: "o2",
      adapterKey: "cdek:delivery",
      priceRub: 400,
      priceIsEstimate: true,
      deliveryDayTo: "2026-09-03",
    }),
  ]);
  assert.equal(d.altAdapterKey, "cdek:delivery");
  assert.equal(d.altPriceIsEstimate, true);
  // The chosen side is firm — the whole point of carrying the flag twice is
  // that these two can differ.
  assert.equal(d.chosenPriceIsEstimate, false);
});

test("altPriceIsEstimate is false when the alternative is a firm price", () => {
  const d = decisionOf([
    offer({ offerId: "o1", priceRub: 500, deliveryDayTo: "2026-09-03" }),
    offer({
      offerId: "o2",
      adapterKey: "cdek:delivery",
      priceRub: 400,
      deliveryDayTo: "2026-09-03",
    }),
  ]);
  assert.equal(d.altPriceIsEstimate, false);
});

test("altPriceIsEstimate is NULL, not false, when there is no alternative", () => {
  const d = decisionOf([
    offer({ offerId: "o1", priceRub: 500, deliveryDayTo: "2026-09-03" }),
  ]);
  assert.equal(d.altAdapterKey, null);
  assert.equal(d.altPriceKop, null);
  assert.equal(d.altDeadlineDay, null);
  assert.equal(d.altPriceIsEstimate, null);
});

test("all four alt fields are null together, never partially", () => {
  const d = decisionOf([
    offer({ offerId: "o1", priceRub: 400, deliveryDayTo: "2026-09-03" }),
    offer({
      offerId: "o2",
      adapterKey: "cdek:delivery",
      priceRub: 900,
      priceIsEstimate: true,
      deliveryDayTo: "2026-09-01",
    }),
  ]);
  assert.deepEqual(
    [d.altAdapterKey, d.altPriceKop, d.altDeadlineDay, d.altPriceIsEstimate],
    [null, null, null, null],
  );
});

test("RULES_VERSION is 1 and is passed through, not read from the module", () => {
  assert.equal(RULES_VERSION, 1);
  const result = buildShipmentDecision({
    offers: [offer({})],
    selectedOfferId: "o1",
    rulesVersion: 7,
    now: NOW,
  });
  assert.equal(result.ok, true);
  assert.equal(result.decision.rulesVersion, 7);
});
