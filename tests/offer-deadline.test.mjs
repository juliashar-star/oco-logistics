import assert from "node:assert/strict";
import test from "node:test";

import { comparableOfferDeadlines } from "../packages/core/src/carrier-adapter/offer-deadline.ts";

/** The identity reader: the fixtures already are the field bag. */
const asIs = (offer) => offer;

const dayed = (deliveryDayTo) => ({ deliveryIntervalTo: "", deliveryDayTo });
const timed = (deliveryIntervalTo) => ({ deliveryIntervalTo, deliveryDayTo: "" });

const run = (offers) => comparableOfferDeadlines(offers, asIs);

// ── degenerate input is contract ───────────────────────────────────────────

test("an empty list yields an empty array", () => {
  assert.deepEqual(run([]), []);
});

test("one timed offer keeps its hour — a group of one is trivially all-timed", () => {
  const [deadline] = run([timed("2026-07-28T12:00:00Z")]);
  assert.equal(deadline.dayKey, "2026-07-28");
  assert.equal(deadline.timeMs, Date.parse("2026-07-28T12:00:00Z"));
});

test("one day-only offer has a day and no hour", () => {
  assert.deepEqual(run([dayed("2026-07-28")]), [
    { dayKey: "2026-07-28", timeMs: null },
  ]);
});

test("no offer with a usable deadline → an array of nulls, parallel to the input", () => {
  const result = run([
    { deliveryIntervalTo: "", deliveryDayTo: "" },
    { deliveryIntervalTo: "   ", deliveryDayTo: "  " },
    { deliveryIntervalTo: "не дата", deliveryDayTo: "" },
    { deliveryIntervalTo: "", deliveryDayTo: "28.07.2026" },
  ]);
  assert.deepEqual(result, [null, null, null, null]);
});

test("the result is always parallel to the input, index for index", () => {
  const result = run([
    dayed("2026-07-28"),
    { deliveryIntervalTo: "", deliveryDayTo: "" },
    timed("2026-07-29T10:00:00Z"),
  ]);
  assert.equal(result.length, 3);
  assert.equal(result[0].dayKey, "2026-07-28");
  assert.equal(result[1], null);
  assert.equal(result[2].dayKey, "2026-07-29");
});

// ── reading the fields ─────────────────────────────────────────────────────

test("deliveryDayFrom is the fallback when deliveryDayTo is blank", () => {
  const result = run([
    { deliveryIntervalTo: "", deliveryDayTo: "", deliveryDayFrom: "2026-07-28" },
  ]);
  assert.deepEqual(result, [{ dayKey: "2026-07-28", timeMs: null }]);
});

test("deliveryDayTo wins over deliveryDayFrom when both are present", () => {
  const result = run([
    {
      deliveryIntervalTo: "",
      deliveryDayTo: "2026-07-30",
      deliveryDayFrom: "2026-07-28",
    },
  ]);
  assert.deepEqual(result, [{ dayKey: "2026-07-30", timeMs: null }]);
});

test("a timed interval wins over a day field and supplies its own Moscow day", () => {
  // 2026-07-28T22:00Z is 2026-07-29 01:00 in Moscow.
  const result = run([
    { deliveryIntervalTo: "2026-07-28T22:00:00Z", deliveryDayTo: "2026-07-28" },
  ]);
  assert.equal(result[0].dayKey, "2026-07-29");
  assert.notEqual(result[0].timeMs, null);
});

// ── masking is per DAY, and only where the day is mixed ────────────────────

test("every offer on a day timed → every hour survives", () => {
  const result = run([
    timed("2026-07-28T09:00:00Z"),
    timed("2026-07-28T18:00:00Z"),
  ]);
  assert.notEqual(result[0].timeMs, null);
  assert.notEqual(result[1].timeMs, null);
  assert.ok(result[0].timeMs < result[1].timeMs);
});

test("one day-only offer on a day masks the hour of every offer on THAT day", () => {
  const result = run([
    timed("2026-07-28T09:00:00Z"),
    dayed("2026-07-28"),
    timed("2026-07-28T18:00:00Z"),
  ]);
  assert.deepEqual(result, [
    { dayKey: "2026-07-28", timeMs: null },
    { dayKey: "2026-07-28", timeMs: null },
    { dayKey: "2026-07-28", timeMs: null },
  ]);
});

test("a day-only offer masks its OWN day and no other", () => {
  // The scope question in one test: a day-only offer on the 29th must not
  // touch the timed offers on the 28th.
  const result = run([
    timed("2026-07-28T09:00:00Z"),
    timed("2026-07-28T18:00:00Z"),
    dayed("2026-07-29"),
  ]);
  assert.notEqual(result[0].timeMs, null);
  assert.notEqual(result[1].timeMs, null);
  assert.deepEqual(result[2], { dayKey: "2026-07-29", timeMs: null });
});

test("an offer with no deadline at all masks nothing", () => {
  const result = run([
    timed("2026-07-28T09:00:00Z"),
    { deliveryIntervalTo: "", deliveryDayTo: "" },
  ]);
  assert.notEqual(result[0].timeMs, null);
  assert.equal(result[1], null);
});

test("masking does not depend on the order the offers arrive in", () => {
  const offers = [
    timed("2026-07-28T09:00:00Z"),
    dayed("2026-07-28"),
    timed("2026-07-29T18:00:00Z"),
  ];
  const forward = run(offers);
  const backward = run([...offers].reverse()).reverse();
  assert.deepEqual(forward, backward);
});

// ── the reader ─────────────────────────────────────────────────────────────

test("the fields are taken through the reader, not off the offer itself", () => {
  const wrapped = [{ inner: dayed("2026-07-28") }];
  assert.deepEqual(comparableOfferDeadlines(wrapped, (o) => o.inner), [
    { dayKey: "2026-07-28", timeMs: null },
  ]);
});
