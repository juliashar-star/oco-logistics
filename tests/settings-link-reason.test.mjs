import assert from "node:assert/strict";
import test from "node:test";

import {
  SETTINGS_LINK_REASON,
  readSettingsLinkReason,
  settingsLinkReasonForBuildFailure,
  settingsLinkTab,
} from "../apps/web/lib/shipments/settings-link-reason.ts";
import {
  describeAdaptersWithoutOffers,
  settingsLinkReasonForAdaptersWithoutOffers,
} from "../apps/web/lib/shipments/describe-adapters-without-offers.ts";
import {
  carrierAuthErrorMessage,
  carrierNotConnectedMessage,
} from "../apps/web/lib/shipments/carrier-connection-messages.ts";
import {
  CALCULATION_GATE_MESSAGES,
  CALCULATION_GATE_SETTINGS_REASON,
} from "../apps/web/lib/shipments/calculation-gate.ts";
import { describeCarriersUnreachable } from "../apps/web/lib/shipments/describe-carriers-unreachable.ts";
import { PROTOTYPE_KEY_CASES } from "./helpers/prototype-keys.mjs";

/**
 * The link beside a new-order error — which settings tab it opens, or none.
 *
 * INVERTED FROM A PIN. The nineteen cases below were first pinned against the
 * old rule (three Russian substrings, a match always opening «Компания») and
 * passed on the unchanged code; after the switch to a code, fourteen of them
 * failed — the five links shown for no reason, the two missing ones, the six
 * connection messages sent to «Компания», and the mixed set — and five did not.
 * `was` keeps the pinned value for the record; `expected` is what is asserted.
 *
 * WHERE THE CODE COMES FROM in each case: a real producer wherever one is a
 * pure function (build-failure mapping, gate mapping, adapter statuses), and the
 * constant the route puts on its response otherwise. That a route really puts it
 * there is NOT provable here — routes are not tested in this repository
 * (CLAUDE.md, rule 1) — and is left to the manual check.
 */

const C = SETTINGS_LINK_REASON.carrierConnection;

const CDEK_AUTH_FAILED = {
  carrierName: "СДЭК",
  serviceTitle: "Доставка по России",
  status: "auth_failed",
};
const EXPRESS_FAILED = {
  carrierName: "Яндекс Доставка",
  serviceTitle: "Доставка в тот же день",
  status: "failed",
};

const CASES = [
  // ── five places that showed the link for no reason ──
  {
    label: "offers:103 declared value",
    text: "Укажите объявленную ценность отправления",
    reason: settingsLinkReasonForBuildFailure("no_declared_value"),
    was: "company",
    expected: null,
  },
  {
    label: "submit:70 declared value",
    text: "Укажите объявленную ценность отправления",
    reason: settingsLinkReasonForBuildFailure("no_declared_value"),
    was: "company",
    expected: null,
  },
  {
    label: "create-draft:42 malformed handover mode",
    text: "Некорректный способ передачи отправления",
    reason: null, // create-draft issues no code at all
    was: "company",
    expected: null,
  },
  {
    label: "create-draft:189 our failure",
    text: "Не удалось создать черновик отправления. Попробуйте позже.",
    reason: null,
    was: "company",
    expected: null,
  },
  {
    label: "offers:207 point of a carrier not connected",
    text: "Выбранный пункт принадлежит перевозчику, который не подключён. Выберите другой пункт выдачи.",
    reason: null, // no code on purpose: the sentence names an action on the form
    was: "company",
    expected: null,
  },
  // ── two places that needed the link and did not show it ──
  {
    label: "submit:334 expired credentials, named",
    text: carrierAuthErrorMessage("cdek"),
    reason: C,
    was: null,
    expected: "connection",
  },
  {
    label: "submit:359 expired credentials, unnamed",
    text: carrierAuthErrorMessage(null),
    reason: C,
    was: null,
    expected: "connection",
  },
  // ── six connection sources that opened «Компания» ──
  {
    label: "calculation-gate:42 no carrier",
    text: CALCULATION_GATE_MESSAGES.no_carrier,
    reason: CALCULATION_GATE_SETTINGS_REASON.no_carrier,
    was: "company",
    expected: "connection",
  },
  {
    label: "offers:184 no carrier",
    text: "Подключите перевозчика в настройках, чтобы рассчитать доставку",
    reason: C,
    was: "company",
    expected: "connection",
  },
  {
    label: "offers:408 auth failed during a quote",
    text: "Не удалось авторизоваться у перевозчика. Проверьте подключение в настройках.",
    reason: C,
    was: "company",
    expected: "connection",
  },
  {
    label: "carrier-connection-messages:86 not connected, unnamed",
    text: carrierNotConnectedMessage(null),
    reason: C,
    was: "company",
    expected: "connection",
  },
  {
    label: "carrier-connection-messages:87 not connected, named",
    text: carrierNotConnectedMessage("cdek"),
    reason: C,
    was: "company",
    expected: "connection",
  },
  {
    label: "describe-adapters-without-offers:123 auth failed alone",
    text: describeCarriersUnreachable([CDEK_AUTH_FAILED]),
    reason: settingsLinkReasonForAdaptersWithoutOffers([CDEK_AUTH_FAILED]),
    was: "company",
    expected: "connection",
  },
  // ── mixed set: auth_failed beside «не отвечает» ──
  {
    label: "mixed set auth_failed + failed",
    text: describeCarriersUnreachable([CDEK_AUTH_FAILED, EXPRESS_FAILED]),
    reason: settingsLinkReasonForAdaptersWithoutOffers([
      CDEK_AUTH_FAILED,
      EXPRESS_FAILED,
    ]),
    was: "company",
    expected: "connection",
  },
  // ── controls: sender texts open «Компания», before and after ──
  {
    label: "calculation-gate:43 no sender",
    text: CALCULATION_GATE_MESSAGES.no_sender,
    reason: CALCULATION_GATE_SETTINGS_REASON.no_sender,
    was: "company",
    expected: "company",
  },
  {
    label: "offers:106 / submit:72 no sender city",
    text: "Укажите город отправления в настройках компании",
    reason: settingsLinkReasonForBuildFailure("no_sender"),
    was: "company",
    expected: "company",
  },
  {
    label: "offers:108 / submit:74 no sender phone",
    text: "Укажите телефон отправителя в настройках",
    reason: settingsLinkReasonForBuildFailure("no_sender_phone"),
    was: "company",
    expected: "company",
  },
  // ── controls: no link, before and after ──
  {
    label: "client: server unreachable",
    text: "Не удалось связаться с сервером",
    reason: null,
    was: null,
    expected: null,
  },
  {
    label: "carriers did not answer, no auth failure",
    text: describeCarriersUnreachable([EXPRESS_FAILED]),
    reason: settingsLinkReasonForAdaptersWithoutOffers([EXPRESS_FAILED]),
    was: null,
    expected: null,
  },
];

// Through the reader, the way the form takes a response body: the code rides
// in `reason` beside `error`, and is absent when there is none.
for (const c of CASES) {
  test(`${c.label} → ${c.expected ?? "no link"} (was ${c.was ?? "no link"})`, () => {
    const body = c.reason === null ? { error: c.text } : { error: c.text, reason: c.reason };
    const reason = readSettingsLinkReason(body);
    assert.equal(settingsLinkTab({ text: c.text, reason }), c.expected);
  });
}

// ── the words are never consulted ───────────────────────────────────────────

test("a text full of the old substrings, with no code, gets no link", () => {
  const text =
    "Перевозчик не подключён — в настройках отправления, всё сразу";
  assert.equal(settingsLinkTab({ text, reason: null }), null);
});

test("a code with an empty text still gets its link", () => {
  assert.equal(settingsLinkTab({ text: "", reason: C }), "connection");
  assert.equal(
    settingsLinkTab({ text: "", reason: SETTINGS_LINK_REASON.senderIncomplete }),
    "company",
  );
});

// ── the constant ───────────────────────────────────────────────────────────

test("two codes, distinct, snake_case", () => {
  const values = Object.values(SETTINGS_LINK_REASON);
  assert.deepEqual(values.sort(), ["carrier_connection", "sender_incomplete"]);
  for (const value of values) {
    assert.match(value, /^[a-z]+(_[a-z]+)*$/);
  }
});

// ── the reader: anything but a known code is «no code» ──────────────────────

for (const [label, body] of [
  ["null body", null],
  ["undefined body", undefined],
  ["a string body", "carrier_connection"],
  ["no reason field", { error: "x" }],
  ["reason null", { error: "x", reason: null }],
  ["reason a number", { error: "x", reason: 1 }],
  ["reason an unknown code", { error: "x", reason: "resend_cooldown" }],
  ["reason in another case", { error: "x", reason: "CARRIER_CONNECTION" }],
  ...PROTOTYPE_KEY_CASES.map(([caseLabel, key]) => [
    `reason ${caseLabel}`,
    { error: "x", reason: key },
  ]),
]) {
  test(`reader: ${label} → no code → no link`, () => {
    const reason = readSettingsLinkReason(body);
    assert.equal(reason, null);
    assert.equal(settingsLinkTab({ text: "x", reason }), null);
  });
}

test("reader: both known codes pass through", () => {
  assert.equal(readSettingsLinkReason({ reason: C }), C);
  assert.equal(
    readSettingsLinkReason({ reason: SETTINGS_LINK_REASON.senderIncomplete }),
    SETTINGS_LINK_REASON.senderIncomplete,
  );
});

// ── build failure: one mapping for both routes ─────────────────────────────

test("build failure: only the sender fields live in settings", () => {
  assert.equal(
    settingsLinkReasonForBuildFailure("no_sender"),
    SETTINGS_LINK_REASON.senderIncomplete,
  );
  assert.equal(
    settingsLinkReasonForBuildFailure("no_sender_phone"),
    SETTINGS_LINK_REASON.senderIncomplete,
  );
  assert.equal(settingsLinkReasonForBuildFailure("no_declared_value"), null);
  assert.equal(settingsLinkReasonForBuildFailure("no_idempotency_key"), null);
  assert.equal(settingsLinkReasonForBuildFailure("no_destination"), null);
});

// ── gate: every refusal has a code, checked by KEY PRESENCE ─────────────────

test("every calculation-gate refusal has its own settings code", () => {
  // Key presence, not the looked-up value: a missing key must fail here rather
  // than resolve to something that happens to pass.
  for (const key of Object.keys(CALCULATION_GATE_MESSAGES)) {
    assert.ok(
      Object.hasOwn(CALCULATION_GATE_SETTINGS_REASON, key),
      `${key} has no settings code`,
    );
  }
  assert.deepEqual(
    Object.keys(CALCULATION_GATE_SETTINGS_REASON).sort(),
    Object.keys(CALCULATION_GATE_MESSAGES).sort(),
  );
});

// ── adapter statuses: code and words from one grouping ─────────────────────

for (const [label, input] of [
  ["not a list", "auth_failed"],
  ["null", null],
  ["empty list", []],
  ["ok", [{ status: "ok" }]],
  ["failed", [{ status: "failed" }]],
  ["timed_out", [{ status: "timed_out" }]],
  ["no_delivery_options", [{ status: "no_delivery_options" }]],
  ["parcel_too_large", [{ status: "parcel_too_large" }]],
  ["an unknown status", [{ status: "something_new" }]],
]) {
  test(`adapters: ${label} → no code`, () => {
    assert.equal(settingsLinkReasonForAdaptersWithoutOffers(input), null);
  });
}

test("adapters: auth_failed anywhere in the list → carrier_connection", () => {
  for (const input of [
    [{ status: "auth_failed" }],
    [{ status: "failed" }, { status: "auth_failed" }],
    [{ status: "no_delivery_options" }, { status: "auth_failed" }, { status: "timed_out" }],
  ]) {
    assert.equal(settingsLinkReasonForAdaptersWithoutOffers(input), C);
  }
});

test("adapters: a code exactly when the words ask to check the connection", () => {
  // The two are built from the same grouping; this is what keeps them from
  // disagreeing if either is ever changed alone.
  const phrase = "проверьте подключение в настройках";
  const statuses = [
    "ok",
    "failed",
    "timed_out",
    "no_delivery_options",
    "parcel_too_large",
    "auth_failed",
    "something_new",
  ];
  const inputs = [];
  for (const a of statuses) {
    inputs.push([{ ...CDEK_AUTH_FAILED, status: a }]);
    for (const b of statuses) {
      inputs.push([
        { ...CDEK_AUTH_FAILED, status: a },
        { ...EXPRESS_FAILED, status: b },
      ]);
    }
  }
  for (const input of inputs) {
    const words = describeAdaptersWithoutOffers(input);
    const saysCheckConnection = words !== null && words.includes(phrase);
    const hasCode = settingsLinkReasonForAdaptersWithoutOffers(input) !== null;
    assert.equal(
      hasCode,
      saysCheckConnection,
      `${JSON.stringify(input.map((e) => e.status))} → words ${JSON.stringify(words)}`,
    );
  }
});
