import assert from "node:assert/strict";
import test from "node:test";

import { comparableOfferDeadlines } from "../packages/core/src/carrier-adapter/offer-deadline.ts";

/**
 * PINNING TEST, written BEFORE the module was touched and shown passing against
 * the unchanged code. It exists so that the additive extension below it — a
 * second entry point that also reports WHICH family of fields the day came from
 * — can be proved not to have moved a single day.
 *
 * The existing offer-deadline.test.mjs pins the masking rules and the two day
 * fallbacks. This file pins the FIELD-FAMILY PRECEDENCE end to end, including
 * one branch nothing covered before: an unparseable interval falling through to
 * a usable day field. shipment-decision.ts depends on exactly that branch.
 *
 * Every case is a single-element list on purpose: masking is a property of a
 * group, and a group of one cannot mask, so each row measures the raw rule.
 */

const asIs = (offer) => offer;
const dayOf = (fields) => {
  const [deadline] = comparableOfferDeadlines([fields], asIs);
  return deadline === null ? null : deadline.dayKey;
};

const CASES = [
  {
    what: "day family: deliveryDayTo alone",
    fields: { deliveryDayTo: "2026-09-03" },
    day: "2026-09-03",
  },
  {
    what: "day family: deliveryDayFrom is the fallback when To is blank",
    fields: { deliveryDayTo: "", deliveryDayFrom: "2026-09-01" },
    day: "2026-09-01",
  },
  {
    what: "day family: deliveryDayTo wins when both day fields are present",
    fields: { deliveryDayTo: "2026-09-03", deliveryDayFrom: "2026-09-01" },
    day: "2026-09-03",
  },
  {
    what: "interval family: an ISO instant becomes its Moscow calendar day",
    fields: { deliveryIntervalTo: "2026-09-01T18:00:00+03:00" },
    day: "2026-09-01",
  },
  {
    what: "interval family: a late UTC instant is the NEXT Moscow day",
    fields: { deliveryIntervalTo: "2026-09-01T22:30:00.000Z" },
    day: "2026-09-02",
  },
  {
    what: "PRECEDENCE: a usable interval beats a usable day field",
    fields: {
      deliveryIntervalTo: "2026-09-01T18:00:00+03:00",
      deliveryDayTo: "2026-09-05",
    },
    day: "2026-09-01",
  },
  {
    what: "PRECEDENCE: an UNPARSEABLE interval falls through to the day field",
    fields: { deliveryIntervalTo: "не дата", deliveryDayTo: "2026-09-05" },
    day: "2026-09-05",
  },
  {
    what: "PRECEDENCE: a blank interval falls through to the day field",
    fields: { deliveryIntervalTo: "   ", deliveryDayTo: "2026-09-05" },
    day: "2026-09-05",
  },
  {
    what: "a day that is not YYYY-MM-DD is not a day",
    fields: { deliveryDayTo: "28.07.2026" },
    day: null,
  },
  {
    what: "nothing usable anywhere",
    fields: { deliveryIntervalTo: "", deliveryDayTo: "", deliveryDayFrom: "" },
    day: null,
  },
  {
    what: "no fields at all",
    fields: {},
    day: null,
  },
];

for (const testCase of CASES) {
  test(`pinned — ${testCase.what}`, () => {
    assert.equal(dayOf(testCase.fields), testCase.day);
  });
}

test("pinned — the whole matrix at once, as one comparison", () => {
  const days = CASES.map((testCase) => dayOf(testCase.fields));
  assert.deepEqual(
    days,
    CASES.map((testCase) => testCase.day),
  );
});
