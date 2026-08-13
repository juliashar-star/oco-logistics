import assert from "node:assert/strict";
import test from "node:test";

import {
  CANCEL_REQUEST_FALLBACK_ERROR_RU,
  CANCEL_REQUEST_SUCCESS_RU,
  cancelRequestErrorMessage,
  cancelRequestNoticeMessage,
} from "../apps/web/lib/shipments/cancel-request-message.ts";
import {
  OCO_CANCEL_ALREADY_REQUESTED,
  OCO_CANCEL_ALREADY_REQUESTED_TEXT_RU,
  OCO_CANCEL_REQUESTED,
  OCO_CANCEL_REQUESTED_TEXT_RU,
} from "../packages/core/src/carrier-adapter/cancel-event-codes.ts";
import { PROTOTYPE_KEY_CASES } from "./helpers/prototype-keys.mjs";

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

// ── the success banner: a known OCO_* code gets its own sentence ───────────

test("OCO_CANCEL_REQUESTED → the «asked, the carrier decides next» sentence", () => {
  assert.equal(
    cancelRequestNoticeMessage(OCO_CANCEL_REQUESTED),
    OCO_CANCEL_REQUESTED_TEXT_RU,
  );
});

test("OCO_CANCEL_ALREADY_REQUESTED → the «already queued» sentence", () => {
  // THE DEFECT THIS SLICE EXISTS FOR. CDEK's cancelCdekOrder returns this when
  // requests[] already carries a DELETE — it sends NOTHING to the carrier — and
  // the seller was still shown «Запрос на отмену отправлен».
  assert.equal(
    cancelRequestNoticeMessage(OCO_CANCEL_ALREADY_REQUESTED),
    OCO_CANCEL_ALREADY_REQUESTED_TEXT_RU,
  );
  assert.notEqual(
    cancelRequestNoticeMessage(OCO_CANCEL_ALREADY_REQUESTED),
    CANCEL_REQUEST_SUCCESS_RU,
  );
});

test("the two known codes do not share a sentence", () => {
  // «we asked just now» and «you already asked» are different facts; rendering
  // them identically would hide that the second press did nothing.
  assert.notEqual(
    cancelRequestNoticeMessage(OCO_CANCEL_REQUESTED),
    cancelRequestNoticeMessage(OCO_CANCEL_ALREADY_REQUESTED),
  );
});

test("surrounding whitespace does not hide a known code", () => {
  assert.equal(
    cancelRequestNoticeMessage(`  ${OCO_CANCEL_ALREADY_REQUESTED}  `),
    OCO_CANCEL_ALREADY_REQUESTED_TEXT_RU,
  );
});

// ── anything else → the general sentence, never a provider string ──────────

for (const [label, reason] of [
  ["a Yandex request/* reason", "cancellation_started"],
  ["another Yandex reason", "cancelled_by_user"],
  ["a Yandex Express claim status", "cancelled_with_payment"],
  ["an unknown OCO-looking code", "OCO_CANCEL_SOMETHING_NEW"],
  ["a lowercased known code", "oco_cancel_already_requested"],
  ["a code with a known one inside it", "NOT_OCO_CANCEL_REQUESTED_EITHER"],
  ["blank string", ""],
  ["whitespace only", "   "],
  ["newlines only", "\n\t "],
  ["missing reason", undefined],
  ["null reason", null],
  ["a number", 409],
  ["an object", { reason: OCO_CANCEL_REQUESTED }],
  ["an array", [OCO_CANCEL_REQUESTED]],
  ["a boolean", false],
  // Object.prototype keys: with a plain object literal as the table these would
  // resolve to a function and be shown to the seller. One shared list across
  // every lookup test — see tests/helpers/prototype-keys.mjs.
  ...PROTOTYPE_KEY_CASES,
]) {
  test(`${label} → the general sentence`, () => {
    assert.equal(cancelRequestNoticeMessage(reason), CANCEL_REQUEST_SUCCESS_RU);
  });
}

test("a carrier's own description is never what comes back", () => {
  // The function takes a REASON, and even when a provider string is handed to
  // it the seller sees our sentence — this is what keeps a response body out of
  // the banner.
  for (const providerText of [
    "Заказ отменен по инициативе клиента",
    "The order has been cancelled",
    "cancellation_started",
  ]) {
    assert.equal(
      cancelRequestNoticeMessage(providerText),
      CANCEL_REQUEST_SUCCESS_RU,
    );
  }
});

test("the notice is never blank", () => {
  for (const reason of [
    OCO_CANCEL_REQUESTED,
    OCO_CANCEL_ALREADY_REQUESTED,
    "",
    undefined,
    7,
  ]) {
    assert.ok(cancelRequestNoticeMessage(reason).trim().length > 0);
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

test("the per-code banner sentences, character for character", () => {
  // These live in packages/core because the timeline uses them too; pinned here
  // because this is where they reach the seller as a banner.
  assert.equal(
    cancelRequestNoticeMessage(OCO_CANCEL_REQUESTED),
    "Отмена запрошена у перевозчика. Статус обновится, когда перевозчик её обработает.",
  );
  assert.equal(
    cancelRequestNoticeMessage(OCO_CANCEL_ALREADY_REQUESTED),
    "Запрос на отмену уже отправлен ранее и ещё обрабатывается перевозчиком. Отправлять его повторно не нужно.",
  );
  // Neither may claim the order is cancelled — accepted is not cancelled, and
  // for the already-queued case nothing was even sent.
  for (const sentence of [
    cancelRequestNoticeMessage(OCO_CANCEL_REQUESTED),
    cancelRequestNoticeMessage(OCO_CANCEL_ALREADY_REQUESTED),
  ]) {
    assert.doesNotMatch(sentence, /Заказ отменён|Заказ отменен/);
  }
});
