import assert from "node:assert/strict";
import test from "node:test";

import {
  CARRIERS_UNREACHABLE_LEAD_RU,
  describeCarriersUnreachable,
} from "../apps/web/lib/shipments/describe-carriers-unreachable.ts";

const cdek = {
  carrierName: "СДЭК",
  serviceTitle: "Доставка по России",
  status: "failed",
};
const yandex = {
  carrierName: "Яндекс Доставка",
  serviceTitle: "Доставка по России",
  status: "timed_out",
};

test("one carrier → singular verb, name first, recalculation invited", () => {
  assert.equal(
    describeCarriersUnreachable([cdek]),
    "Тарифы не пришли: СДЭК · Доставка по России — не отвечает, попробуйте рассчитать ещё раз.",
  );
});

test("several carriers → plural verb, and the lead-in does not change", () => {
  // The lead-in carries no numeral and agrees with nothing outside itself, so
  // it is correct for one carrier and for five. Only the half after the colon
  // bends, and it bends by count, not by gender.
  assert.equal(
    describeCarriersUnreachable([cdek, yandex]),
    "Тарифы не пришли: СДЭК · Доставка по России, Яндекс Доставка · Доставка по России — не отвечают, попробуйте рассчитать ещё раз.",
  );
});

test("a mixed set is reported as mixed, never summarised", () => {
  // The whole reason this outcome may exist: it makes no aggregate claim. One
  // carrier was silent, another answered honestly that it does not serve the
  // route, and the seller reads both.
  const notice = describeCarriersUnreachable([
    cdek,
    { ...yandex, status: "no_delivery_options" },
  ]);
  assert.ok(notice.includes("не отвечает"));
  assert.ok(notice.includes("не возит по этому направлению"));
});

test("never claims the seller has no delivery options", () => {
  // The one sentence this outcome must not produce: at least one carrier did
  // not answer, so whether options exist is unknown.
  for (const adapters of [[cdek], [cdek, yandex], [{ ...cdek, status: "auth_failed" }]]) {
    const notice = describeCarriersUnreachable(adapters);
    assert.equal(/нет вариантов/i.test(notice), false, notice);
    assert.equal(/нет доставки/i.test(notice), false, notice);
  }
});

test("a real carrier name keeps its capitals after the colon", () => {
  // Lower-casing the first letter to sit after a colon would turn «СДЭК» into
  // «сДЭК». The detail is passed through untouched for exactly this reason.
  assert.ok(describeCarriersUnreachable([cdek]).includes(": СДЭК"));
});

test("no provider key or adapter key reaches the sentence", () => {
  const notice = describeCarriersUnreachable([cdek, yandex]);
  for (const key of ["yataxi", "cdek", "next_day", "express", "failed", "timed_out"]) {
    assert.equal(
      notice.toLowerCase().includes(key.toLowerCase()),
      false,
      `«${key}» leaked into: ${notice}`,
    );
  }
});

test("nothing nameable → null, so the caller keeps its own wording", () => {
  assert.equal(describeCarriersUnreachable([]), null);
  assert.equal(describeCarriersUnreachable(undefined), null);
  // A status the notice does not understand yields no phrase, and a bare
  // lead-in with a dangling colon must never be printed.
  assert.equal(describeCarriersUnreachable([{ ...cdek, status: "ok" }]), null);
});

test("the lead-in speaks about our request, not about the world", () => {
  assert.equal(CARRIERS_UNREACHABLE_LEAD_RU, "Тарифы не пришли");
});
