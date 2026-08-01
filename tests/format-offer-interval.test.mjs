import assert from "node:assert/strict";
import test from "node:test";

import {
  formatOfferDeliveryDays,
  formatOfferInterval,
  moscowDayKey,
} from "../apps/web/lib/date/format-offer-interval.ts";

test("formatOfferInterval: both ends blank or unparseable → empty string", () => {
  const now = new Date("2026-07-27T12:00:00.000Z");
  assert.equal(formatOfferInterval("", "", now), "");
  assert.equal(formatOfferInterval("  ", "not-a-date", now), "");
  assert.equal(formatOfferInterval("bad", "also-bad", now), "");
});

test("formatOfferInterval: only from usable → that end alone", () => {
  const now = new Date("2026-07-27T06:00:00.000Z"); // Moscow 09:00 27 Jul
  assert.equal(
    formatOfferInterval("2026-07-27T10:00:00.000Z", "", now),
    "сегодня, 13:00",
  );
});

test("formatOfferInterval: only to usable → that end alone", () => {
  const now = new Date("2026-07-27T06:00:00.000Z");
  assert.equal(
    formatOfferInterval("", "2026-07-28T15:00:00.000Z", now),
    "завтра, 18:00",
  );
});

test("formatOfferInterval: from already passed → «день, до HH:MM» on the to end", () => {
  const now = new Date("2026-07-27T08:00:00.000Z"); // after from
  assert.equal(
    formatOfferInterval(
      "2026-07-27T07:30:00.000Z",
      "2026-07-27T12:00:00.000Z",
      now,
    ),
    "сегодня, до 15:00",
  );
});

test("formatOfferInterval: same Moscow day, from in the future → HH:MM–HH:MM", () => {
  const now = new Date("2026-07-27T06:00:00.000Z"); // Moscow 09:00
  assert.equal(
    formatOfferInterval(
      "2026-07-27T10:00:00.000Z",
      "2026-07-27T14:00:00.000Z",
      now,
    ),
    "сегодня, 13:00–17:00",
  );
});

test("formatOfferInterval: different Moscow days → dayFrom HH:MM — dayTo HH:MM", () => {
  const now = new Date("2026-07-27T06:00:00.000Z");
  assert.equal(
    formatOfferInterval(
      "2026-07-27T10:00:00.000Z",
      "2026-07-28T15:00:00.000Z",
      now,
    ),
    "сегодня 13:00 — завтра 18:00",
  );
});

test("formatOfferInterval: weekday label when not today/tomorrow", () => {
  const now = new Date("2026-07-27T06:00:00.000Z"); // Mon 27 Jul Moscow
  const label = formatOfferInterval(
    "2026-07-29T06:00:00.000Z",
    "2026-07-29T15:00:00.000Z",
    now,
  );
  assert.equal(label, "ср, 29 июля, 09:00–18:00");
});

test("formatOfferInterval: Moscow zone — UTC evening is next calendar day in Moscow", () => {
  // 2026-07-28T22:30:00Z = 2026-07-29 01:30 Europe/Moscow
  const now = new Date("2026-07-28T22:30:00.000Z");
  assert.equal(moscowDayKey(now), "2026-07-29");

  // Interval still on Moscow 28 Jul must NOT say «сегодня»
  const onPrevMoscowDay = formatOfferInterval(
    "2026-07-28T10:00:00.000Z",
    "2026-07-28T12:00:00.000Z",
    now,
  );
  assert.equal(onPrevMoscowDay.startsWith("сегодня"), false);
  assert.match(onPrevMoscowDay, /28 июля/);

  // Interval on Moscow 29 Jul is «сегодня»
  assert.equal(
    formatOfferInterval(
      "2026-07-28T22:00:00.000Z",
      "2026-07-29T15:00:00.000Z",
      now,
    ),
    "сегодня, до 18:00",
  );
});

test("formatOfferDeliveryDays: both blank or invalid → empty string", () => {
  const now = new Date("2026-07-27T06:00:00.000Z");
  assert.equal(formatOfferDeliveryDays("", "", now), "");
  assert.equal(formatOfferDeliveryDays("  ", "not-a-date", now), "");
  assert.equal(formatOfferDeliveryDays("2026-13-40", "bad", now), "");
});

test("formatOfferDeliveryDays: only one usable → single-day label", () => {
  const now = new Date("2026-07-27T06:00:00.000Z"); // Mon 27 Jul Moscow
  assert.equal(formatOfferDeliveryDays("2026-07-27", "", now), "сегодня");
  assert.equal(formatOfferDeliveryDays("", "2026-07-28", now), "завтра");
  assert.equal(
    formatOfferDeliveryDays("2026-07-29", "", now),
    "ср, 29 июля",
  );
});

test("formatOfferDeliveryDays: same day → single-day label", () => {
  const now = new Date("2026-07-27T06:00:00.000Z");
  assert.equal(
    formatOfferDeliveryDays("2026-07-27", "2026-07-27", now),
    "сегодня",
  );
  assert.equal(
    formatOfferDeliveryDays("2026-07-29", "2026-07-29", now),
    "ср, 29 июля",
  );
});

test("formatOfferDeliveryDays: same month → day–day month (en dash)", () => {
  const now = new Date("2026-07-27T06:00:00.000Z");
  assert.equal(
    formatOfferDeliveryDays("2026-08-03", "2026-08-04", now),
    "3–4 августа",
  );
});

test("formatOfferDeliveryDays: different months → day month — day month (em dash)", () => {
  const now = new Date("2026-07-27T06:00:00.000Z");
  assert.equal(
    formatOfferDeliveryDays("2026-07-31", "2026-08-02", now),
    "31 июля — 2 августа",
  );
});

test("formatOfferDeliveryDays: no clock time in any output", () => {
  const now = new Date("2026-07-27T06:00:00.000Z");
  const samples = [
    formatOfferDeliveryDays("", "", now),
    formatOfferDeliveryDays("2026-07-27", "", now),
    formatOfferDeliveryDays("", "2026-07-28", now),
    formatOfferDeliveryDays("2026-07-29", "", now),
    formatOfferDeliveryDays("2026-07-27", "2026-07-27", now),
    formatOfferDeliveryDays("2026-08-03", "2026-08-04", now),
    formatOfferDeliveryDays("2026-07-31", "2026-08-02", now),
  ];
  for (const label of samples) {
    assert.equal(label.includes(":"), false, `unexpected clock in ${JSON.stringify(label)}`);
  }
});
