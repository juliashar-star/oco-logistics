import assert from "node:assert/strict";
import test from "node:test";

import { describePartialPickupPoints } from "../apps/web/lib/shipments/describe-partial-pickup-points.ts";

/**
 * DECISION CHANGED 18.08, BEHAVIOUR DID NOT. The cabinet shows real carrier
 * names now, so the fixtures moved from «Перевозчик №N» to «СДЭК» / «Яндекс
 * Доставка» / «Dostavista». Two wording rules changed with them, and both are
 * consequences of that decision, not of a broken function:
 *
 * — the verbs are PRESENT tense («не отвечает», «не находит»), because Russian
 *   past-tense verbs agree with gender and the three real names do not share
 *   one; the present tense carries no gender at all;
 * — the «Для X …» shape is gone, and with it the genitive transform that bent
 *   «Перевозчик №N» into «Перевозчика №N». «Для СДЭК» / «Для Яндекс Доставки» /
 *   «Для Dostavista» have three different correct forms, so the name now stands
 *   first in the nominative and the rest follows an em dash.
 */

test("all ok → null", () => {
  assert.equal(
    describePartialPickupPoints([
      { providerKey: "yataxi", status: "ok", carrierName: "Яндекс Доставка" },
      { providerKey: "cdek", status: "ok", carrierName: "СДЭК" },
    ]),
    null,
  );
});

test("empty carriers array → null", () => {
  assert.equal(describePartialPickupPoints([]), null);
  assert.equal(describePartialPickupPoints(undefined), null);
});

test("ok with zero points is ignored (not a partial failure)", () => {
  assert.equal(
    describePartialPickupPoints([
      { providerKey: "yataxi", status: "ok", carrierName: "Яндекс Доставка" },
    ]),
    null,
  );
});

test("one failed among two ok", () => {
  assert.equal(
    describePartialPickupPoints([
      { providerKey: "yataxi", status: "ok", carrierName: "Яндекс Доставка" },
      { providerKey: "cdek", status: "failed", carrierName: "СДЭК" },
      {
        providerKey: "other",
        status: "ok",
        carrierName: "Dostavista",
      },
    ]),
    "СДЭК — не отвечает",
  );
});

test("city_not_resolved", () => {
  assert.equal(
    describePartialPickupPoints([
      {
        providerKey: "cdek",
        status: "city_not_resolved",
        carrierName: "СДЭК",
      },
      { providerKey: "yataxi", status: "ok", carrierName: "Яндекс Доставка" },
    ]),
    "СДЭК — не находит этот город",
  );
});

test("no_adapter", () => {
  assert.equal(
    describePartialPickupPoints([
      { providerKey: "cdek", status: "no_adapter", carrierName: "СДЭК" },
      { providerKey: "yataxi", status: "ok", carrierName: "Яндекс Доставка" },
    ]),
    "СДЭК — список пунктов пока недоступен",
  );
});

test("two different statuses at once → both groups, joined", () => {
  assert.equal(
    describePartialPickupPoints([
      { providerKey: "yataxi", status: "ok", carrierName: "Яндекс Доставка" },
      { providerKey: "cdek", status: "failed", carrierName: "СДЭК" },
      {
        providerKey: "alpha",
        status: "no_adapter",
        carrierName: "Dostavista",
      },
    ]),
    "СДЭК — не отвечает; Dostavista — список пунктов пока недоступен",
  );
});

test("provider error / message text never reaches the string", () => {
  const providerMessage =
    "PROVIDER_ERR_TEXT_should_never_leak: connection refused upstream";
  const result = describePartialPickupPoints([
    {
      providerKey: "cdek",
      status: "failed",
      carrierName: "СДЭК",
      message: providerMessage,
      error: providerMessage,
      providerMessage,
    },
  ]);
  assert.equal(result, "СДЭК — не отвечает");
  assert.equal(result.includes(providerMessage), false);
  assert.equal(result.includes("connection refused"), false);
  assert.equal(result.includes("PROVIDER_ERR_TEXT"), false);
});

test("empty carrierName → neither providerKey nor key-like token", () => {
  const providerKey = "yataxi_secret_key_xyz99";
  const result = describePartialPickupPoints([
    {
      providerKey,
      status: "failed",
      carrierName: "",
    },
  ]);
  assert.ok(result);
  assert.equal(result.includes(providerKey), false);
  assert.equal(result.includes("yataxi"), false);
  assert.equal(result.includes("secret_key"), false);
  assert.equal(result.includes("_xyz"), false);
  assert.equal(result, "Один из перевозчиков — не отвечает");
});

test("empty carrierName: every group keeps the fallback in the NOMINATIVE — nothing declines it", () => {
  assert.equal(
    describePartialPickupPoints([
      {
        providerKey: "alpha_key_zzz",
        status: "city_not_resolved",
        carrierName: "",
      },
    ]),
    "Один из перевозчиков — не находит этот город",
  );
  assert.equal(
    describePartialPickupPoints([
      {
        providerKey: "beta_key_zzz",
        status: "no_adapter",
        carrierName: "",
      },
    ]),
    "Один из перевозчиков — список пунктов пока недоступен",
  );
});

// ── the name is never declined ─────────────────────────────────────────────

test("a carrier name appears EXACTLY as the registry spells it, in every group", () => {
  // The guard the 18.08 decision needs: real names have three different
  // declension behaviours («СДЭК» indeclinable, «Яндекс Доставка» feminine two
  // words, «Dostavista» Latin), so the only safe rule is not to bend them at
  // all. Every status group must contain the name byte for byte.
  for (const name of ["Яндекс Доставка", "Dostavista", "СДЭК"]) {
    for (const status of ["failed", "city_not_resolved", "no_adapter"]) {
      const notice = describePartialPickupPoints([
        { providerKey: "x", status, carrierName: name },
      ]);
      assert.ok(notice, `${name} / ${status} must produce a notice`);
      assert.ok(
        notice.includes(name),
        `${name} must survive «${status}» unbent, got: ${notice}`,
      );
      // No genitive of the two Russian names may appear anywhere.
      assert.equal(notice.includes("Яндекс Доставки"), false);
      assert.equal(notice.includes("СДЭКа"), false);
    }
  }
});