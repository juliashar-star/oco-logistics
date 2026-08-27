import assert from "node:assert/strict";
import test from "node:test";

import {
  OFFER_PRIORITY_CHEAPEST_RU,
  OFFER_PRIORITY_FASTEST_RU,
  OFFER_PRIORITY_HINT_RU,
  OFFER_PRIORITY_LEGEND_RU,
  OFFER_PRIORITY_NONE_RU,
  preselectLineFor,
  preselectNotice,
  resolvePreselect,
} from "../apps/web/lib/shipments/preselect-notice.ts";

const notice = (reason, priority) => preselectNotice({ reason, priority });

// ── the four sentences, exactly ────────────────────────────────────────────

test("rule → says which criterion was applied, and only about the shown list", () => {
  assert.equal(
    notice("rule", "CHEAPEST"),
    "Подставлен самый дешёвый из показанных.",
  );
  assert.equal(
    notice("rule", "FASTEST"),
    "Подставлен самый быстрый из показанных.",
  );
});

test("tie → says the options are indistinguishable and hands the choice back", () => {
  assert.equal(
    notice("tie", "CHEAPEST"),
    "Несколько показанных вариантов стоят одинаково — выберите сами.",
  );
  assert.equal(
    notice("tie", "FASTEST"),
    "Несколько показанных вариантов приезжают одинаково быстро — выберите сами.",
  );
});

// ── silence ────────────────────────────────────────────────────────────────

test("no_rule, single and not_applicable say nothing at all", () => {
  for (const reason of ["no_rule", "single", "not_applicable"]) {
    assert.equal(notice(reason, "CHEAPEST"), null, reason);
    assert.equal(notice(reason, "FASTEST"), null, reason);
  }
});

test("no priority → silent whatever the reason", () => {
  for (const reason of ["rule", "tie", "single", "no_rule", "not_applicable"]) {
    assert.equal(notice(reason, null), null, reason);
    assert.equal(notice(reason, undefined), null, reason);
  }
});

// ── the seller-language rules ──────────────────────────────────────────────

const EVERY_STRING = [
  OFFER_PRIORITY_LEGEND_RU,
  OFFER_PRIORITY_NONE_RU,
  OFFER_PRIORITY_CHEAPEST_RU,
  OFFER_PRIORITY_FASTEST_RU,
  OFFER_PRIORITY_HINT_RU,
  notice("rule", "CHEAPEST"),
  notice("rule", "FASTEST"),
  notice("tie", "CHEAPEST"),
  notice("tie", "FASTEST"),
];

test("no digit anywhere, so count-noun agreement can never apply", () => {
  for (const text of EVERY_STRING) {
    assert.equal(/\d/.test(text), false, `digit in: ${text}`);
  }
});

test("no provider key, adapter key or carrier name reaches a seller", () => {
  const forbidden = [
    "yataxi",
    "cdek",
    "СДЭК",
    "Яндекс",
    "next_day",
    "express",
    "courier",
    "CHEAPEST",
    "FASTEST",
    "no_rule",
    "not_applicable",
    "tie",
  ];
  for (const text of EVERY_STRING) {
    for (const key of forbidden) {
      assert.equal(
        text.toLowerCase().includes(key.toLowerCase()),
        false,
        `«${key}» leaked into: ${text}`,
      );
    }
  }
});

test("«из показанных» is present on both rule sentences, and is not decoration", () => {
  // It keeps the claim true when a pickup point has narrowed the list to one
  // carrier: «самый дешёвый» alone would be a claim about the market.
  assert.ok(notice("rule", "CHEAPEST").includes("из показанных"));
  assert.ok(notice("rule", "FASTEST").includes("из показанных"));
});

test("the hint states the scope of a departure: this order, setting untouched", () => {
  assert.equal(
    OFFER_PRIORITY_HINT_RU,
    "Подставленный вариант можно заменить в любом заказе — настройка от этого не изменится.",
  );
});

test("the three control options are the ones the spec fixed", () => {
  assert.equal(OFFER_PRIORITY_LEGEND_RU, "Что подставлять в новом заказе");
  assert.equal(OFFER_PRIORITY_NONE_RU, "Ничего не подставлять");
  assert.equal(OFFER_PRIORITY_CHEAPEST_RU, "Самый дешёвый вариант");
  assert.equal(OFFER_PRIORITY_FASTEST_RU, "Самый быстрый вариант");
});

// ── the line follows the SELECTION, not the moment the offers arrived ───────

test("resolvePreselect: an id the list does not contain preselects nothing", () => {
  const resolved = resolvePreselect(
    { offerId: "ghost", reason: "rule", priority: "CHEAPEST" },
    ["a", "b"],
  );
  assert.deepEqual(resolved, {
    offerId: null,
    reason: "not_applicable",
    priority: "CHEAPEST",
  });
  // …and therefore says nothing: a line claiming a preselected card while none
  // is selected is the exact desync this resolve step exists to prevent.
  assert.equal(preselectLineFor(resolved, null), null);
});

test("resolvePreselect: an id the list contains is kept as is", () => {
  const preselect = { offerId: "b", reason: "rule", priority: "FASTEST" };
  assert.deepEqual(resolvePreselect(preselect, ["a", "b"]), preselect);
});

test("resolvePreselect: a tie carries through untouched", () => {
  const tie = { offerId: null, reason: "tie", priority: "CHEAPEST" };
  assert.deepEqual(resolvePreselect(tie, ["a", "b"]), tie);
});

test("the rule line stands while its card is selected and clears when another is", () => {
  const resolved = { offerId: "b", reason: "rule", priority: "CHEAPEST" };
  assert.equal(
    preselectLineFor(resolved, "b"),
    "Подставлен самый дешёвый из показанных.",
  );
  assert.equal(preselectLineFor(resolved, "a"), null);
  assert.equal(preselectLineFor(resolved, null), null);
});

test("the tie line stands while nothing is selected and clears once something is", () => {
  const resolved = { offerId: null, reason: "tie", priority: "FASTEST" };
  assert.equal(
    preselectLineFor(resolved, null),
    "Несколько показанных вариантов приезжают одинаково быстро — выберите сами.",
  );
  assert.equal(preselectLineFor(resolved, "a"), null);
});

test("no preselect at all → no line, whatever is selected", () => {
  assert.equal(preselectLineFor(null, null), null);
  assert.equal(preselectLineFor(null, "a"), null);
});
