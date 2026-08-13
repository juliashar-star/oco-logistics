import assert from "node:assert/strict";
import test from "node:test";

import {
  CANCEL_REQUEST_FALLBACK_ERROR_RU,
  CANCEL_REQUEST_SUCCESS_RU,
  cancelRequestErrorMessage,
} from "../apps/web/lib/shipments/cancel-request-message.ts";

// ── the route's message wins whenever there is one ─────────────────────────

test("a route message is shown verbatim", () => {
  const message =
    "Бесплатно отменить этот заказ уже нельзя. Дальнейшая отмена возможна только на стороне перевозчика и будет платной.";
  assert.equal(cancelRequestErrorMessage({ error: message }), message);
});

test("each of the route's real 409 messages survives unchanged", () => {
  // These are the sentences the cancel route actually returns. If any were
  // swallowed, the seller would be told to retry something that cannot succeed.
  for (const message of [
    "Бесплатно отменить этот заказ уже нельзя. Дальнейшая отмена возможна только на стороне перевозчика и будет платной.",
    "Этот заказ уже нельзя отменить — обратитесь в поддержку перевозчика.",
    "Не удалось определить перевозчика по этому отправлению — отмена через ОСО недоступна.",
    "Заказ уже завершён",
    "Заказ ещё не создан у перевозчика",
    "Перевозчик не знает этот заказ. Мы уже разбираемся.",
  ]) {
    assert.equal(cancelRequestErrorMessage({ error: message }), message);
    assert.notEqual(cancelRequestErrorMessage({ error: message }), CANCEL_REQUEST_FALLBACK_ERROR_RU);
  }
});

test("surrounding whitespace is trimmed but the sentence is kept", () => {
  assert.equal(
    cancelRequestErrorMessage({ error: "  Заказ уже завершён  " }),
    "Заказ уже завершён",
  );
});

test("other fields in the body are ignored", () => {
  assert.equal(
    cancelRequestErrorMessage({ error: "Заказ уже завершён", ok: false, code: 409 }),
    "Заказ уже завершён",
  );
});

// ── nothing usable → the fallback, never an empty panel ────────────────────

for (const [label, body] of [
  ["blank string", { error: "" }],
  ["whitespace only", { error: "   " }],
  ["newlines only", { error: "\n\t " }],
  ["missing error key", { ok: false }],
  ["empty object", {}],
  ["null body", null],
  ["undefined body", undefined],
  ["a string body", "Заказ уже завершён"],
  ["a number body", 409],
  ["an array body", []],
  ["error is null", { error: null }],
  ["error is a number", { error: 409 }],
  ["error is an object", { error: { message: "nope" } }],
  ["error is an array", { error: ["nope"] }],
  ["error is a boolean", { error: false }],
]) {
  test(`${label} → the fallback sentence`, () => {
    assert.equal(cancelRequestErrorMessage(body), CANCEL_REQUEST_FALLBACK_ERROR_RU);
  });
}

test("the result is never blank — an empty red panel says less than the fallback", () => {
  for (const body of [{ error: "" }, { error: "  " }, null, {}, 7]) {
    assert.ok(cancelRequestErrorMessage(body).trim().length > 0);
  }
});

// ── wording pin ────────────────────────────────────────────────────────────

test("the seller-facing cancellation wording, character for character", () => {
  // THE ONE PLACE THESE LITERALS ARE WRITTEN OUT — same role as the pins in
  // tests/cdek-cancel-order.test.mjs and tests/carrier-connection-messages.test.mjs.
  // Every assertion above compares against the constants, which pins behaviour
  // but says nothing about the words; this is what stops the sentences changing
  // silently.
  assert.equal(
    CANCEL_REQUEST_FALLBACK_ERROR_RU,
    "Не удалось отменить заказ. Обновите страницу или попробуйте позже.",
  );
  assert.equal(
    CANCEL_REQUEST_SUCCESS_RU,
    "Запрос на отмену отправлен. Статус изменится, когда перевозчик его обработает.",
  );
  // The success line must not claim the order IS cancelled — the route writes
  // no status precisely because accepted is not cancelled.
  assert.doesNotMatch(CANCEL_REQUEST_SUCCESS_RU, /отменён|отменен|Заказ отменён/);
});
