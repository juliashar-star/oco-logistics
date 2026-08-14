import assert from "node:assert/strict";
import test from "node:test";

import { describeAdaptersWithoutOffers } from "../apps/web/lib/shipments/describe-adapters-without-offers.ts";

/** The four registry entries as the route resolves them today. */
const NEXT_DAY = { carrierName: "Перевозчик №1", serviceTitle: "Доставка по России" };
const EXPRESS = { carrierName: "Перевозчик №1", serviceTitle: "Доставка в тот же день" };
const COURIER = {
  carrierName: "Перевозчик №1",
  serviceTitle: "Доставка лёгких посылок в тот же день",
};
const CDEK = { carrierName: "Перевозчик №2", serviceTitle: "Доставка по России" };

const withStatus = (entry, status) => ({ ...entry, status });

// ── nothing to say ─────────────────────────────────────────────────────────

test("empty list → null", () => {
  assert.equal(describeAdaptersWithoutOffers([]), null);
});

for (const [label, input] of [
  ["undefined", undefined],
  ["null", null],
  ["a string", "no_delivery_options"],
  ["a number", 4],
  ["an object", { status: "failed" }],
]) {
  test(`${label} instead of a list → null`, () => {
    assert.equal(describeAdaptersWithoutOffers(input), null);
  });
}

test("status ok is ignored — an honest empty answer is not a failure", () => {
  // Same rule as the pickup-points notice: `ok` with nothing to sell needs no
  // sentence. Reachable here: Yandex documents { ok: true, offers: [] }, and
  // same-provider dedupe can empty an adapter that did answer.
  assert.equal(
    describeAdaptersWithoutOffers([withStatus(NEXT_DAY, "ok")]),
    null,
  );
});

test("an unknown status is ignored, never guessed at", () => {
  assert.equal(
    describeAdaptersWithoutOffers([withStatus(CDEK, "something_new")]),
    null,
  );
});

// ── one adapter of each status ─────────────────────────────────────────────

test("no_delivery_options — the carrier does not serve this route", () => {
  assert.equal(
    describeAdaptersWithoutOffers([withStatus(CDEK, "no_delivery_options")]),
    "Перевозчик №2 · Доставка по России — не возит по этому направлению",
  );
});

test("timed_out — did not answer", () => {
  assert.equal(
    describeAdaptersWithoutOffers([withStatus(EXPRESS, "timed_out")]),
    "Перевозчик №1 · Доставка в тот же день — не ответил, попробуйте рассчитать ещё раз",
  );
});

test("failed — same sentence as timed_out, the seller cannot act on the difference", () => {
  assert.equal(
    describeAdaptersWithoutOffers([withStatus(EXPRESS, "failed")]),
    "Перевозчик №1 · Доставка в тот же день — не ответил, попробуйте рассчитать ещё раз",
  );
});

test("auth_failed — points at the one thing the seller can fix", () => {
  assert.equal(
    describeAdaptersWithoutOffers([withStatus(CDEK, "auth_failed")]),
    "Перевозчик №2 · Доставка по России — проверьте подключение в настройках",
  );
});

// ── several in one group: comma list and number agreement ──────────────────

test("two unreachable → plural verb, names joined by a comma", () => {
  assert.equal(
    describeAdaptersWithoutOffers([
      withStatus(EXPRESS, "failed"),
      withStatus(COURIER, "timed_out"),
    ]),
    "Перевозчик №1 · Доставка в тот же день, Перевозчик №1 · Доставка лёгких посылок в тот же день — не ответили, попробуйте рассчитать ещё раз",
  );
});

test("two that do not serve the route → plural verb", () => {
  assert.equal(
    describeAdaptersWithoutOffers([
      withStatus(CDEK, "no_delivery_options"),
      withStatus(NEXT_DAY, "no_delivery_options"),
    ]),
    "Перевозчик №2 · Доставка по России, Перевозчик №1 · Доставка по России — не возят по этому направлению",
  );
});

test("singular and plural differ only in the verb, never in a bent noun", () => {
  const one = describeAdaptersWithoutOffers([withStatus(CDEK, "failed")]);
  const two = describeAdaptersWithoutOffers([
    withStatus(CDEK, "failed"),
    withStatus(EXPRESS, "failed"),
  ]);
  assert.match(one, /не ответил,/);
  assert.match(two, /не ответили,/);
});

// ── several groups: fixed order ────────────────────────────────────────────

test("three groups at once → fixed order, joined by «; », one capital", () => {
  const notice = describeAdaptersWithoutOffers([
    // deliberately shuffled relative to STATUS_ORDER
    withStatus(EXPRESS, "auth_failed"),
    withStatus(COURIER, "failed"),
    withStatus(CDEK, "no_delivery_options"),
  ]);
  assert.equal(
    notice,
    "Перевозчик №2 · Доставка по России — не возит по этому направлению; " +
      "Перевозчик №1 · Доставка лёгких посылок в тот же день — не ответил, попробуйте рассчитать ещё раз; " +
      "Перевозчик №1 · Доставка в тот же день — проверьте подключение в настройках",
  );
  // Only the very first character is capitalised, not each group.
  assert.equal(notice.includes("; Перевозчик"), true);
});

test("the pair disambiguates what one name cannot", () => {
  // Three yataxi entries share a providerKey → one carrierName; next_day and
  // cdek:delivery share a title. Only the pair tells them apart.
  const notice = describeAdaptersWithoutOffers([
    withStatus(NEXT_DAY, "failed"),
    withStatus(CDEK, "failed"),
  ]);
  assert.equal(
    notice,
    "Перевозчик №1 · Доставка по России, Перевозчик №2 · Доставка по России — не ответили, попробуйте рассчитать ещё раз",
  );
  assert.notEqual(
    describeAdaptersWithoutOffers([withStatus(NEXT_DAY, "failed")]),
    describeAdaptersWithoutOffers([withStatus(EXPRESS, "failed")]),
  );
});

// ── blank halves ───────────────────────────────────────────────────────────

test("blank service title → the carrier name alone", () => {
  assert.equal(
    describeAdaptersWithoutOffers([
      { carrierName: "Перевозчик №2", serviceTitle: "   ", status: "failed" },
    ]),
    "Перевозчик №2 — не ответил, попробуйте рассчитать ещё раз",
  );
});

test("blank carrier name → the service title alone", () => {
  assert.equal(
    describeAdaptersWithoutOffers([
      { carrierName: "", serviceTitle: "Доставка по России", status: "failed" },
    ]),
    "Доставка по России — не ответил, попробуйте рассчитать ещё раз",
  );
});

test("both halves blank or missing → «один из перевозчиков», never a key", () => {
  assert.equal(
    describeAdaptersWithoutOffers([
      { carrierName: "", serviceTitle: "", status: "failed" },
    ]),
    "Один из перевозчиков — не ответил, попробуйте рассчитать ещё раз",
  );
  assert.equal(
    describeAdaptersWithoutOffers([{ status: "failed" }]),
    "Один из перевозчиков — не ответил, попробуйте рассчитать ещё раз",
  );
});

// ── the two guards from the precedent ──────────────────────────────────────

test("provider error text never reaches the string", () => {
  const providerMessage =
    "PROVIDER_ERR_TEXT_should_never_leak: connection refused upstream";
  const result = describeAdaptersWithoutOffers([
    {
      ...CDEK,
      status: "failed",
      message: providerMessage,
      error: providerMessage,
      providerMessage,
      body: { errors: [{ code: "v2_internal_error", message: providerMessage }] },
    },
  ]);
  assert.equal(result, "Перевозчик №2 · Доставка по России — не ответил, попробуйте рассчитать ещё раз");
  assert.equal(result.includes(providerMessage), false);
  assert.equal(result.includes("connection refused"), false);
  assert.equal(result.includes("PROVIDER_ERR_TEXT"), false);
  assert.equal(result.includes("v2_internal_error"), false);
});

test("neither the adapter key nor the provider key can reach the string", () => {
  const adapterKey = "cdek:delivery_secret_xyz99";
  const providerKey = "cdek_provider_key_zzz";
  const result = describeAdaptersWithoutOffers([
    { ...CDEK, status: "auth_failed", key: adapterKey, adapterKey, providerKey },
  ]);
  assert.ok(result);
  assert.equal(result.includes(adapterKey), false);
  assert.equal(result.includes(providerKey), false);
  assert.equal(result.includes("cdek"), false);
  assert.equal(result.includes("secret"), false);
  assert.equal(result.includes("_xyz"), false);
  assert.equal(result.includes("yataxi"), false);
});
