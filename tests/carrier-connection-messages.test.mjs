import assert from "node:assert/strict";
import test from "node:test";

import {
  carrierAuthErrorMessage,
  carrierNotConnectedMessage,
} from "../apps/web/lib/shipments/carrier-connection-messages.ts";
import {
  PROVIDER_SELLER_DISPLAY_NAMES,
  providerSellerDisplayName,
} from "../packages/core/src/carrier-adapter/provider-seller-display-names.ts";
import { ORDER_ADAPTERS } from "../packages/core/src/carrier-adapter/order-adapters.ts";
import { PROTOTYPE_KEY_CASES } from "./helpers/prototype-keys.mjs";

const BOTH = [
  ["auth", carrierAuthErrorMessage],
  ["not connected", carrierNotConnectedMessage],
];

// ── every provider names ITSELF, in both sentences ─────────────────────────

for (const [label, build] of BOTH) {
  test(`${label}: every masked provider key yields its own name`, () => {
    for (const [providerKey, name] of Object.entries(
      PROVIDER_SELLER_DISPLAY_NAMES,
    )) {
      const message = build(providerKey);
      assert.ok(
        message.includes(name),
        `${providerKey} → ${label} message must contain ${JSON.stringify(name)}`,
      );
      // ...and must not contain any OTHER provider's name.
      for (const [otherKey, otherName] of Object.entries(
        PROVIDER_SELLER_DISPLAY_NAMES,
      )) {
        if (otherKey === providerKey || otherName === name) continue;
        assert.ok(
          !message.includes(otherName),
          `${providerKey} must not be announced as ${otherName}`,
        );
      }
    }
  });

  test(`${label}: every adapter in the registry resolves to a named message`, () => {
    for (const entry of Object.values(ORDER_ADAPTERS)) {
      const message = build(entry.providerKey);
      const name = PROVIDER_SELLER_DISPLAY_NAMES[entry.providerKey];
      assert.ok(name, `${entry.key} providerKey must be masked`);
      assert.ok(message.includes(name), `${entry.key} → ${message}`);
    }
  });
}

// ── THE DEFECT, stated executably ──────────────────────────────────────────

test("a CDEK adapter never produces a message containing «Яндекс»", () => {
  const cdekEntries = Object.values(ORDER_ADAPTERS).filter(
    (e) => e.providerKey === "cdek",
  );
  assert.ok(cdekEntries.length > 0, "there must be a CDEK adapter to test");
  for (const entry of cdekEntries) {
    for (const [, build] of BOTH) {
      assert.doesNotMatch(
        build(entry.providerKey),
        /Яндекс/,
        `${entry.key} must not name Yandex`,
      );
    }
  }
});

// ── unknown → name NO carrier ──────────────────────────────────────────────

for (const [label, build] of BOTH) {
  for (const [caseLabel, key] of [
    ["null", null],
    ["undefined", undefined],
    ["empty", ""],
    ["blank", "   "],
    ["unknown key", "nope"],
    ...PROTOTYPE_KEY_CASES,
  ]) {
    test(`${label}: ${caseLabel} names no carrier at all`, () => {
      const message = build(key);
      for (const name of Object.values(PROVIDER_SELLER_DISPLAY_NAMES)) {
        assert.ok(!message.includes(name), `must not name ${name}`);
      }
      assert.doesNotMatch(message, /Яндекс|СДЭК|CDEK|Yandex/);
    });
  }
}

test("an unmasked provider is NOT unmasked by the fallback helper", () => {
  // providerSellerDisplayName falls back to CARRIER_REGISTRY's REAL name for a
  // key it cannot mask. These functions must never do that — an unmasked
  // carrier name in a seller-facing sentence is the leak the mask exists to
  // prevent. Pinned by contrast: the helper resolves a real name, we do not.
  const real = providerSellerDisplayName("rupost");
  if (real !== undefined) {
    assert.ok(!carrierAuthErrorMessage("rupost").includes(real));
    assert.ok(!carrierNotConnectedMessage("rupost").includes(real));
  }
});

// ── grammar: «не подключён» is masculine ───────────────────────────────────

test("every masked name is masculine, which is what «не подключён» agrees with", () => {
  // The wording says «Перевозчик №2 не подключён … Подключите ЕГО». Both are
  // masculine. Every current name is «Перевозчик №N», a masculine noun, so the
  // agreement holds. If a feminine name is ever added («Почта России»), this
  // fails and forces the sentence to be revisited instead of quietly
  // disagreeing on a seller's screen.
  for (const [providerKey, name] of Object.entries(
    PROVIDER_SELLER_DISPLAY_NAMES,
  )) {
    assert.ok(
      name.startsWith("Перевозчик "),
      `${providerKey} is ${JSON.stringify(name)} — if this is not masculine, «не подключён» no longer agrees`,
    );
  }
});

// ── wording pin ────────────────────────────────────────────────────────────

test("the seller-facing connection wording, character for character", () => {
  // THE ONE PLACE THESE LITERALS ARE WRITTEN OUT — same role as the pin in
  // tests/cdek-cancel-order.test.mjs. Every other assertion here checks a
  // property (contains the right name, names no carrier), all of which would
  // stay green if the sentence around the name changed or emptied.
  assert.equal(
    carrierAuthErrorMessage("yataxi"),
    "Не удалось авторизоваться: Перевозчик №1. Проверьте подключение.",
  );
  assert.equal(
    carrierAuthErrorMessage("cdek"),
    "Не удалось авторизоваться: Перевозчик №2. Проверьте подключение.",
  );
  assert.equal(
    carrierAuthErrorMessage(null),
    "Не удалось авторизоваться у перевозчика. Проверьте подключение.",
  );
  assert.equal(
    carrierNotConnectedMessage("yataxi"),
    "Перевозчик №1 не подключён. Подключите его в настройках, чтобы продолжить.",
  );
  assert.equal(
    carrierNotConnectedMessage("cdek"),
    "Перевозчик №2 не подключён. Подключите его в настройках, чтобы продолжить.",
  );
  assert.equal(
    carrierNotConnectedMessage(null),
    "Перевозчик не подключён. Подключите его в настройках, чтобы продолжить.",
  );
  // The masked name already contains «перевозчик», so the frame must not say it
  // again — «в сервисе «Перевозчик №2»» is what this guards against.
  assert.doesNotMatch(carrierAuthErrorMessage("cdek"), /в сервисе/);
});
