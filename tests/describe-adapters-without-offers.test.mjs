import assert from "node:assert/strict";
import test from "node:test";

import { describeAdaptersWithoutOffers } from "../apps/web/lib/shipments/describe-adapters-without-offers.ts";

/**
 * DECISION CHANGED 18.08, BEHAVIOUR DID NOT. The cabinet now shows the
 * carriers' REAL names instead of «Перевозчик №N» — masking stayed only on the
 * public site — so every fixture and every expected string here was rewritten
 * from the masked vocabulary to the real one. The verb also moved to the
 * present tense («не отвечает»): past-tense Russian verbs agree with gender,
 * and «СДЭК», «Яндекс Доставка» and «Dostavista» do not share one.
 */

/** The four registry entries as the route resolves them today. */
const NEXT_DAY = { carrierName: "Яндекс Доставка", serviceTitle: "Доставка по России" };
const EXPRESS = { carrierName: "Яндекс Доставка", serviceTitle: "Доставка в тот же день" };
const COURIER = {
  carrierName: "Яндекс Доставка",
  serviceTitle: "Доставка лёгких посылок в тот же день",
};
const CDEK = { carrierName: "СДЭК", serviceTitle: "Доставка по России" };

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
    "СДЭК · Доставка по России — не возит по этому направлению",
  );
});

test("timed_out — did not answer", () => {
  assert.equal(
    describeAdaptersWithoutOffers([withStatus(EXPRESS, "timed_out")]),
    "Яндекс Доставка · Доставка в тот же день — не отвечает, попробуйте рассчитать ещё раз",
  );
});

test("failed — same sentence as timed_out, the seller cannot act on the difference", () => {
  assert.equal(
    describeAdaptersWithoutOffers([withStatus(EXPRESS, "failed")]),
    "Яндекс Доставка · Доставка в тот же день — не отвечает, попробуйте рассчитать ещё раз",
  );
});

test("auth_failed — points at the one thing the seller can fix", () => {
  assert.equal(
    describeAdaptersWithoutOffers([withStatus(CDEK, "auth_failed")]),
    "СДЭК · Доставка по России — проверьте подключение в настройках",
  );
});

// ── several in one group: comma list and number agreement ──────────────────

test("two unreachable → plural verb, names joined by a comma", () => {
  assert.equal(
    describeAdaptersWithoutOffers([
      withStatus(EXPRESS, "failed"),
      withStatus(COURIER, "timed_out"),
    ]),
    "Яндекс Доставка · Доставка в тот же день, Яндекс Доставка · Доставка лёгких посылок в тот же день — не отвечают, попробуйте рассчитать ещё раз",
  );
});

test("two that do not serve the route → plural verb", () => {
  assert.equal(
    describeAdaptersWithoutOffers([
      withStatus(CDEK, "no_delivery_options"),
      withStatus(NEXT_DAY, "no_delivery_options"),
    ]),
    "СДЭК · Доставка по России, Яндекс Доставка · Доставка по России — не возят по этому направлению",
  );
});

test("singular and plural differ only in the verb, never in a bent noun", () => {
  const one = describeAdaptersWithoutOffers([withStatus(CDEK, "failed")]);
  const two = describeAdaptersWithoutOffers([
    withStatus(CDEK, "failed"),
    withStatus(EXPRESS, "failed"),
  ]);
  assert.match(one, /не отвечает,/);
  assert.match(two, /не отвечают,/);
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
    "СДЭК · Доставка по России — не возит по этому направлению; " +
      "Яндекс Доставка · Доставка лёгких посылок в тот же день — не отвечает, попробуйте рассчитать ещё раз; " +
      "Яндекс Доставка · Доставка в тот же день — проверьте подключение в настройках",
  );
  // Only the very first character is capitalised, not each group: the groups
  // after «; » start with a name in its registry spelling, untouched.
  assert.equal(notice.includes("; Яндекс Доставка"), true);
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
    "Яндекс Доставка · Доставка по России, СДЭК · Доставка по России — не отвечают, попробуйте рассчитать ещё раз",
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
      { carrierName: "СДЭК", serviceTitle: "   ", status: "failed" },
    ]),
    "СДЭК — не отвечает, попробуйте рассчитать ещё раз",
  );
});

test("blank carrier name → the service title alone", () => {
  assert.equal(
    describeAdaptersWithoutOffers([
      { carrierName: "", serviceTitle: "Доставка по России", status: "failed" },
    ]),
    "Доставка по России — не отвечает, попробуйте рассчитать ещё раз",
  );
});

test("both halves blank or missing → «один из перевозчиков», never a key", () => {
  assert.equal(
    describeAdaptersWithoutOffers([
      { carrierName: "", serviceTitle: "", status: "failed" },
    ]),
    "Один из перевозчиков — не отвечает, попробуйте рассчитать ещё раз",
  );
  assert.equal(
    describeAdaptersWithoutOffers([{ status: "failed" }]),
    "Один из перевозчиков — не отвечает, попробуйте рассчитать ещё раз",
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
  assert.equal(result, "СДЭК · Доставка по России — не отвечает, попробуйте рассчитать ещё раз");
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

// ── parcel_too_large ───────────────────────────────────────────────────────
// A parcel the service will not carry is NOT a statement about the route. The
// group exists because «не возит по этому направлению» was being shown for a
// parcel that was simply too big — a sentence about geography for a decision
// taken about size, and one the seller could not act on.

test("parcel_too_large, one service → singular, about the parcel and not the route", () => {
  const result = describeAdaptersWithoutOffers([
    withStatus(COURIER, "parcel_too_large"),
  ]);
  assert.equal(
    result,
    "Яндекс Доставка · Доставка лёгких посылок в тот же день — не принимает посылку такого веса или размера",
  );
  assert.equal(result.includes("направлению"), false);
});

test("parcel_too_large, several services → plural verb, one sentence", () => {
  const result = describeAdaptersWithoutOffers([
    withStatus(COURIER, "parcel_too_large"),
    withStatus(EXPRESS, "parcel_too_large"),
  ]);
  assert.equal(
    result,
    "Яндекс Доставка · Доставка лёгких посылок в тот же день, Яндекс Доставка · Доставка в тот же день — не принимают посылку такого веса или размера",
  );
});

test("parcel_too_large is stated before the route group", () => {
  const result = describeAdaptersWithoutOffers([
    withStatus(CDEK, "no_delivery_options"),
    withStatus(COURIER, "parcel_too_large"),
  ]);
  assert.ok(result);
  assert.ok(
    result.indexOf("не принимает посылку") < result.indexOf("не возит"),
    "the actionable group must come first",
  );
});

test("parcel_too_large and no_delivery_options stay separate sentences", () => {
  const result = describeAdaptersWithoutOffers([
    withStatus(COURIER, "parcel_too_large"),
    withStatus(CDEK, "no_delivery_options"),
  ]);
  assert.equal(
    result,
    "Яндекс Доставка · Доставка лёгких посылок в тот же день — не принимает посылку такого веса или размера; СДЭК · Доставка по России — не возит по этому направлению",
  );
});
