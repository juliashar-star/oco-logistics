import assert from "node:assert/strict";
import test from "node:test";

import {
  carrierAuthErrorMessage,
  carrierNotConnectedMessage,
} from "../apps/web/lib/shipments/carrier-connection-messages.ts";
import {
  CARRIER_CABINET_NAME_FALLBACK,
  carrierCabinetName,
} from "../packages/core/src/carrier-adapter/carrier-cabinet-names.ts";
import { ORDER_ADAPTERS } from "../packages/core/src/carrier-adapter/order-adapters.ts";
import { PROTOTYPE_KEY_CASES } from "./helpers/prototype-keys.mjs";

/**
 * DECISION CHANGED 18.08: the cabinet names the carrier for real. This file
 * used to iterate PROVIDER_SELLER_DISPLAY_NAMES (the masking map); it now
 * iterates the keys the cabinet actually resolves, through carrierCabinetName.
 */
const CABINET_NAMES = Object.fromEntries(
  ["cdek", "yataxi", "rupost", "dostavista"].map((key) => [
    key,
    carrierCabinetName(key),
  ]),
);

const BOTH = [
  ["auth", carrierAuthErrorMessage],
  ["not connected", carrierNotConnectedMessage],
];

// ── every provider names ITSELF, in both sentences ─────────────────────────

for (const [label, build] of BOTH) {
  test(`${label}: every masked provider key yields its own name`, () => {
    for (const [providerKey, name] of Object.entries(
      CABINET_NAMES,
    )) {
      const message = build(providerKey);
      assert.ok(
        message.includes(name),
        `${providerKey} → ${label} message must contain ${JSON.stringify(name)}`,
      );
      // ...and must not contain any OTHER provider's name.
      for (const [otherKey, otherName] of Object.entries(
        CABINET_NAMES,
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
      const name = CABINET_NAMES[entry.providerKey];
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
      for (const name of Object.values(CABINET_NAMES)) {
        assert.ok(!message.includes(name), `must not name ${name}`);
      }
      assert.doesNotMatch(message, /Яндекс|СДЭК|CDEK|Yandex/);
    });
  }
}

test("a carrier with no registry name is not named at all", () => {
  // DECISION CHANGED 18.08: a REAL name is now the desired outcome, so the old
  // «must not unmask rupost» assertion was inverted — rupost IS named. What
  // survives is the other half of the rule: a key the registry cannot name
  // yields a sentence naming nobody, never a name invented from the key.
  assert.ok(carrierAuthErrorMessage("rupost").includes("Почта России"));
  const unknown = carrierAuthErrorMessage("cse");
  assert.equal(unknown.includes(CARRIER_CABINET_NAME_FALLBACK), false);
  assert.equal(unknown.includes("CSE"), false);
  assert.equal(unknown.includes("cse"), false);
  assert.equal(
    unknown,
    "Не удалось авторизоваться у перевозчика. Проверьте подключение.",
  );
});

// ── grammar: «не подключён» is masculine ───────────────────────────────────

test("no sentence agrees with gender any more, and no name is declined", () => {
  // REPLACES «every masked name is masculine». That test could exist only while
  // every name was «Перевозчик №N». Real names have three genders and two
  // scripts, so the sentences were rewritten to agree with nothing: the name
  // stands first, in the nominative, followed by an em dash. This pins that the
  // registry spelling survives byte for byte in both messages.
  for (const providerKey of ["cdek", "yataxi", "rupost", "dostavista"]) {
    const name = carrierCabinetName(providerKey);
    assert.notEqual(name, CARRIER_CABINET_NAME_FALLBACK);
    for (const build of [carrierAuthErrorMessage, carrierNotConnectedMessage]) {
      const message = build(providerKey);
      assert.ok(message.includes(name), `${providerKey} → ${message}`);
    }
  }
  // The two Russian names must never appear in an oblique case.
  const yandex = carrierNotConnectedMessage("yataxi");
  assert.equal(yandex.includes("Яндекс Доставки"), false);
  assert.equal(yandex.includes("Яндекс Доставку"), false);
  assert.equal(carrierNotConnectedMessage("rupost").includes("Почты России"), false);
});

// ── wording pin ────────────────────────────────────────────────────────────

test("the seller-facing connection wording, character for character", () => {
  // THE ONE PLACE THESE LITERALS ARE WRITTEN OUT — same role as the pin in
  // tests/cdek-cancel-order.test.mjs. Every other assertion here checks a
  // property (contains the right name, names no carrier), all of which would
  // stay green if the sentence around the name changed or emptied.
  assert.equal(
    carrierAuthErrorMessage("yataxi"),
    "Не удалось авторизоваться: Яндекс Доставка. Проверьте подключение.",
  );
  assert.equal(
    carrierAuthErrorMessage("cdek"),
    "Не удалось авторизоваться: СДЭК. Проверьте подключение.",
  );
  assert.equal(
    carrierAuthErrorMessage(null),
    "Не удалось авторизоваться у перевозчика. Проверьте подключение.",
  );
  assert.equal(
    carrierNotConnectedMessage("yataxi"),
    "Яндекс Доставка — нет подключения. Подключите перевозчика в настройках, чтобы продолжить.",
  );
  assert.equal(
    carrierNotConnectedMessage("cdek"),
    "СДЭК — нет подключения. Подключите перевозчика в настройках, чтобы продолжить.",
  );
  assert.equal(
    carrierNotConnectedMessage(null),
    "Перевозчик не подключён. Подключите его в настройках, чтобы продолжить.",
  );
  // The masked name already contains «перевозчик», so the frame must not say it
  // again — «в сервисе «Перевозчик №2»» is what this guards against.
  assert.doesNotMatch(carrierAuthErrorMessage("cdek"), /в сервисе/);
});
