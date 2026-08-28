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

test("rule → says which criterion was applied and where it was set", () => {
  assert.equal(
    notice("rule", "CHEAPEST"),
    "Выбран самый дешёвый из показанных тарифов — приоритет задан в настройках.",
  );
  assert.equal(
    notice("rule", "FASTEST"),
    "Выбран самый быстрый из показанных тарифов — приоритет задан в настройках.",
  );
});

test("tie → names what tied and hands the choice back", () => {
  assert.equal(
    notice("tie", "CHEAPEST"),
    "У нескольких тарифов одинаковая цена — выберите подходящий.",
  );
  // NOT symmetric, and deliberately so: reaching a tie under FASTEST now proves
  // the price matched too, because any difference would have been broken by the
  // badge. Saying only «одинаковый срок» would send the seller to compare
  // prices we already know are equal.
  assert.equal(
    notice("tie", "FASTEST"),
    "У нескольких тарифов совпали и цена, и срок — выберите подходящий.",
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

test("«из показанных» scopes both rule sentences to the list on screen", () => {
  // A chosen pickup point narrows the list to the carrier that owns it, so the
  // rule may be choosing among one carrier's tariffs. Without this phrase the
  // line would claim the cheapest tariff that exists, which is more than we
  // know. The tie sentences need no equivalent: «у нескольких тарифов» is
  // already about some tariffs rather than all of them.
  assert.ok(notice("rule", "CHEAPEST").includes("из показанных"));
  assert.ok(notice("rule", "FASTEST").includes("из показанных"));
});

test("both rule sentences name where the priority was set, and it is not decoration", () => {
  // A selection the seller cannot explain is one they have to undo to trust.
  // Naming the setting is what makes the line actionable rather than merely
  // informative — it says where to go to change the behaviour.
  assert.ok(notice("rule", "CHEAPEST").includes("приоритет задан в настройках"));
  assert.ok(notice("rule", "FASTEST").includes("приоритет задан в настройках"));
});

test("each tie sentence names WHICH field tied, never just that something did", () => {
  // «одинаковы» alone gives the seller nothing to decide on. Under CHEAPEST the
  // price is what matched and the deadline is what they weigh next; under
  // FASTEST both matched, and the sentence has to say so or it points them at a
  // comparison that cannot help.
  assert.ok(notice("tie", "CHEAPEST").includes("одинаковая цена"));
  assert.ok(notice("tie", "FASTEST").includes("и цена, и срок"));
});

test("one word for one thing: «тариф», never «вариант» or «оффер»", () => {
  for (const text of EVERY_STRING) {
    assert.equal(/вариант/i.test(text), false, `«вариант» in: ${text}`);
    assert.equal(/оффер/i.test(text), false, `«оффер» in: ${text}`);
  }
});

test("the hint states the scope of a departure: this order, setting untouched", () => {
  assert.equal(
    OFFER_PRIORITY_HINT_RU,
    "Выбранный тариф можно заменить в любом заказе — настройка от этого не изменится.",
  );
});

test("the three control options are the ones the spec fixed", () => {
  assert.equal(OFFER_PRIORITY_LEGEND_RU, "Какой тариф выбирать автоматически");
  assert.equal(OFFER_PRIORITY_NONE_RU, "Не выбирать — выберу сам");
  assert.equal(OFFER_PRIORITY_CHEAPEST_RU, "Самый дешёвый");
  assert.equal(OFFER_PRIORITY_FASTEST_RU, "Самый быстрый");
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
    "Выбран самый дешёвый из показанных тарифов — приоритет задан в настройках.",
  );
  assert.equal(preselectLineFor(resolved, "a"), null);
  assert.equal(preselectLineFor(resolved, null), null);
});

test("the tie line stands while nothing is selected and clears once something is", () => {
  const resolved = { offerId: null, reason: "tie", priority: "FASTEST" };
  assert.equal(
    preselectLineFor(resolved, null),
    "У нескольких тарифов совпали и цена, и срок — выберите подходящий.",
  );
  assert.equal(preselectLineFor(resolved, "a"), null);
});

test("no preselect at all → no line, whatever is selected", () => {
  assert.equal(preselectLineFor(null, null), null);
  assert.equal(preselectLineFor(null, "a"), null);
});
