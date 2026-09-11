import assert from "node:assert/strict";
import test from "node:test";

import { capitalizeFieldLabel } from "../apps/web/lib/carriers/capitalize-field-label.ts";
import { describeCarrierFormGap } from "../apps/web/lib/carriers/describe-carrier-form-gap.ts";
import { carrierFormGapMessage } from "../apps/web/lib/carriers/carrier-form-gap-message.ts";
import { isCarrierFormComplete } from "../apps/web/lib/carriers/is-carrier-form-complete.ts";
import { shouldAcceptFieldValue } from "../apps/web/lib/carriers/should-accept-field-value.ts";
import { CARRIER_CONNECT_FIELDS } from "../apps/web/lib/carriers/carrier-connect-fields.ts";
import { pickSuppliedCredentials } from "../apps/web/lib/carriers/pick-supplied-credentials.ts";
import { connectSuccessMessage } from "../apps/web/lib/carriers/connect-success-message.ts";
import { PROTOTYPE_KEYS } from "./helpers/prototype-keys.mjs";

// ── capitalizeFieldLabel

test("capitalizeFieldLabel: capitalises the first letter of a Cyrillic label", () => {
  assert.equal(capitalizeFieldLabel("токен доступа"), "Токен доступа");
  assert.equal(
    capitalizeFieldLabel("идентификатор точки отгрузки"),
    "Идентификатор точки отгрузки",
  );
});

test("capitalizeFieldLabel: touches ONLY the first character — API stays uppercase", () => {
  assert.equal(
    capitalizeFieldLabel("пароль для доступа к API"),
    "Пароль для доступа к API",
  );
});

test("capitalizeFieldLabel: already capitalised and empty input are safe", () => {
  assert.equal(capitalizeFieldLabel("Тип договора"), "Тип договора");
  assert.equal(capitalizeFieldLabel(""), "");
});

test("capitalizeFieldLabel: every real label survives and gains a capital", () => {
  for (const fields of Object.values(CARRIER_CONNECT_FIELDS)) {
    for (const field of fields) {
      const shown = capitalizeFieldLabel(field.label);
      assert.equal(shown.slice(1), field.label.slice(1), field.name);
      assert.equal(shown.charAt(0), field.label.charAt(0).toUpperCase(), field.name);
    }
  }
});

// ── pickSuppliedCredentials — what actually leaves the browser
//
// An untouched field must be ABSENT from the body, not an empty string: the
// service merges the submission over the stored bag, so a blank would be a
// supplied value there and could overwrite a working credential.

test("pickSuppliedCredentials: nothing typed → an empty body", () => {
  assert.deepEqual(pickSuppliedCredentials({}), {});
  assert.deepEqual(pickSuppliedCredentials({ token: "", account: "" }), {});
});

test("pickSuppliedCredentials: one field typed → only that field", () => {
  assert.deepEqual(
    pickSuppliedCredentials({ platformStationId: "", token: "tok" }),
    { token: "tok" },
  );
});

test("pickSuppliedCredentials: all fields typed → all of them", () => {
  assert.deepEqual(
    pickSuppliedCredentials({
      account: "acct",
      securePassword: "secret",
      contractType: "1",
    }),
    { account: "acct", securePassword: "secret", contractType: "1" },
  );
});

test("pickSuppliedCredentials: a whitespace-only value is not a value", () => {
  assert.deepEqual(
    pickSuppliedCredentials({ token: "   ", account: "\t\n" }),
    {},
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      pickSuppliedCredentials({ token: "  " }),
      "token",
    ),
    false,
    "the key must be absent, not present-and-blank",
  );
});

test("pickSuppliedCredentials: a value is sent exactly as typed, not trimmed", () => {
  // Trimming is a decision about the seller's secret; only blankness is judged.
  assert.deepEqual(pickSuppliedCredentials({ token: " tok " }), {
    token: " tok ",
  });
});

// ── connectSuccessMessage — the two outcomes are different events

test("connectSuccessMessage: a carrier that was NOT connected → first connection", () => {
  assert.equal(connectSuccessMessage(false), "Перевозчик подключён.");
});

test("connectSuccessMessage: a carrier that WAS connected → credentials updated", () => {
  assert.equal(connectSuccessMessage(true), "Данные обновлены.");
});

test("connectSuccessMessage: the two cases never read the same", () => {
  assert.notEqual(connectSuccessMessage(true), connectSuccessMessage(false));
});

// ── shouldAcceptFieldValue — the focus gate
//
// Measured: Chrome autofilled the seller's OWN site login into the Яндекс
// text+password pair AND fired a change event, so the value reached React state
// and armed the submit button. Load-time autofill arrives without focus, so
// focus is what separates it from typing, pasting or picking a saved entry.

test("shouldAcceptFieldValue: a never-focused field is rejected", () => {
  assert.equal(shouldAcceptFieldValue({}, "token"), false);
  assert.equal(shouldAcceptFieldValue({ token: false }, "token"), false);
});

test("shouldAcceptFieldValue: a focused field is accepted", () => {
  assert.equal(shouldAcceptFieldValue({ token: true }, "token"), true);
});

test("shouldAcceptFieldValue: focusing one field does not unlock another", () => {
  const interacted = { platformStationId: true };
  assert.equal(shouldAcceptFieldValue(interacted, "platformStationId"), true);
  assert.equal(
    shouldAcceptFieldValue(interacted, "token"),
    false,
    "the autofilled half of a login pair must stay rejected",
  );
});

test("shouldAcceptFieldValue: a field focused then blurred stays accepted", () => {
  // Blur removes nothing — the seller may fill one field, leave it, and come
  // back. Only never-focused fields are refused.
  const afterBlur = { token: true };
  assert.equal(shouldAcceptFieldValue(afterBlur, "token"), true);
});

test("shouldAcceptFieldValue: showing a secret is not interacting with it", () => {
  // The eye toggle keeps its own state, which the gate never reads. What the
  // gate reads is `interacted`, and only onFocus writes there — so a field the
  // seller revealed but never focused stays rejected, exactly as before.
  // (That the toggle cannot write to `interacted` is a property of the
  // component's wiring, not of this function; see the report.)
  const revealedButNeverFocused = {};
  assert.equal(
    shouldAcceptFieldValue(revealedButNeverFocused, "token"),
    false,
  );
  // …and revealing a sibling changes nothing either.
  assert.equal(
    shouldAcceptFieldValue({ platformStationId: true }, "token"),
    false,
  );
});

test("shouldAcceptFieldValue: prototype-chain names cannot unlock themselves", () => {
  for (const name of PROTOTYPE_KEYS) {
    assert.equal(shouldAcceptFieldValue({}, name), false, name);
  }
});

// ── isCarrierFormComplete

const YANDEX_FIELDS = CARRIER_CONNECT_FIELDS.yataxi;
const CDEK_FIELDS = CARRIER_CONNECT_FIELDS.cdek;

test("isCarrierFormComplete: not connected + nothing filled → not ready", () => {
  assert.equal(isCarrierFormComplete(YANDEX_FIELDS, {}, false), false);
  assert.equal(isCarrierFormComplete(CDEK_FIELDS, {}, false), false);
});

test("isCarrierFormComplete: not connected + one field missing → not ready", () => {
  assert.equal(
    isCarrierFormComplete(
      YANDEX_FIELDS,
      { platformStationId: "station-1" },
      false,
    ),
    false,
  );
  assert.equal(
    isCarrierFormComplete(
      CDEK_FIELDS,
      { account: "acct", securePassword: "secret" },
      false,
    ),
    false,
  );
});

test("isCarrierFormComplete: not connected + blank or whitespace → not ready", () => {
  assert.equal(
    isCarrierFormComplete(
      YANDEX_FIELDS,
      { platformStationId: "station-1", token: "   " },
      false,
    ),
    false,
  );
});

test("isCarrierFormComplete: not connected + choice left unchosen → not ready", () => {
  assert.equal(
    isCarrierFormComplete(
      CDEK_FIELDS,
      { account: "acct", securePassword: "secret" },
      false,
    ),
    false,
    "contractType absent",
  );
  assert.equal(
    isCarrierFormComplete(
      CDEK_FIELDS,
      { account: "acct", securePassword: "secret", contractType: "" },
      false,
    ),
    false,
    "contractType present but empty",
  );
});

test("isCarrierFormComplete: not connected + choice outside options → not ready", () => {
  assert.equal(
    isCarrierFormComplete(
      CDEK_FIELDS,
      { account: "acct", securePassword: "secret", contractType: "3" },
      false,
    ),
    false,
    "the service would refuse it, so the button must not invite the click",
  );
});

test("isCarrierFormComplete: not connected + all filled → ready", () => {
  assert.equal(
    isCarrierFormComplete(
      YANDEX_FIELDS,
      { platformStationId: "station-1", token: "tok" },
      false,
    ),
    true,
  );
  assert.equal(
    isCarrierFormComplete(
      CDEK_FIELDS,
      { account: "acct", securePassword: "secret", contractType: "1" },
      false,
    ),
    true,
  );
});

test("isCarrierFormComplete: connected + nothing typed → not ready", () => {
  assert.equal(isCarrierFormComplete(YANDEX_FIELDS, {}, true), false);
  assert.equal(isCarrierFormComplete(CDEK_FIELDS, {}, true), false);
});

test("isCarrierFormComplete: connected + one field typed → ready", () => {
  assert.equal(
    isCarrierFormComplete(
      YANDEX_FIELDS,
      { platformStationId: "station-1" },
      true,
    ),
    true,
  );
  assert.equal(
    isCarrierFormComplete(CDEK_FIELDS, { account: "acct" }, true),
    true,
  );
  assert.equal(
    isCarrierFormComplete(CDEK_FIELDS, { contractType: "2" }, true),
    true,
    "a single valid choice is enough when already connected",
  );
});

test("isCarrierFormComplete: connected + only whitespace → not ready", () => {
  assert.equal(
    isCarrierFormComplete(YANDEX_FIELDS, { token: "   " }, true),
    false,
  );
});

test("isCarrierFormComplete: connected + out-of-set choice alone → not ready", () => {
  assert.equal(
    isCarrierFormComplete(CDEK_FIELDS, { contractType: "3" }, true),
    false,
  );
});

test("isCarrierFormComplete: not connected — omitting any single field blocks readiness", () => {
  // The pure shadow of the anti-autofill rule: what a browser paints into the
  // DOM is not in this map, so it cannot make a form ready. Proved for every
  // field of every carrier, not just one arrangement — no field can be skipped
  // on first connect.
  for (const [providerKey, fields] of Object.entries(CARRIER_CONNECT_FIELDS)) {
    const complete = Object.fromEntries(
      fields.map((field) => [
        field.name,
        field.kind === "choice" ? field.options[0].value : `typed-${field.name}`,
      ]),
    );
    assert.equal(
      isCarrierFormComplete(fields, complete, false),
      true,
      `${providerKey}: the fully typed baseline must be ready`,
    );

    for (const omitted of fields) {
      const partial = { ...complete };
      delete partial[omitted.name];
      assert.equal(
        isCarrierFormComplete(fields, partial, false),
        false,
        `${providerKey}: ${omitted.name} missing from the values map must block the button`,
      );
    }
  }
});

test("isCarrierFormComplete: not connected — extra values for foreign fields are ignored", () => {
  assert.equal(
    isCarrierFormComplete(
      YANDEX_FIELDS,
      {
        platformStationId: "station-1",
        token: "tok",
        contractType: "1",
      },
      false,
    ),
    true,
  );
});

// ── describeCarrierFormGap
//
// The twelve isCarrierFormComplete tests above are the consistency guard for
// these: the boolean is DERIVED from describeCarrierFormGap, so a gap
// misclassified at the ready/not-ready boundary fails them. A separate
// "the boolean agrees with the gap" test is deliberately NOT written — it could
// not fail, and a guard nobody can watch fail proves nothing.

/** Same shape the table-driven test above uses: every field carries a sendable value. */
function completeValues(fields) {
  return Object.fromEntries(
    fields.map((field) => [
      field.name,
      field.kind === "choice" ? field.options[0].value : `typed-${field.name}`,
    ]),
  );
}

const names = (fields) => fields.map((field) => field.name);

test("describeCarrierFormGap: not connected + one field blank → that field, alone", () => {
  const gap = describeCarrierFormGap(
    CDEK_FIELDS,
    { account: "acct", securePassword: "secret" },
    false,
  );
  assert.equal(gap.kind, "missing");
  assert.deepEqual(names(gap.blank), ["contractType"]);
  assert.deepEqual(names(gap.badChoice), []);
});

test("describeCarrierFormGap: not connected + two blank → both, in the order of the field list", () => {
  const gap = describeCarrierFormGap(
    CDEK_FIELDS,
    { securePassword: "secret" },
    false,
  );
  assert.equal(gap.kind, "missing");
  // Source order, never sorted — it is the order the seller sees on screen.
  assert.deepEqual(names(gap.blank), ["account", "contractType"]);
});

test("describeCarrierFormGap: not connected + all blank → all of them, in order", () => {
  const gap = describeCarrierFormGap(CDEK_FIELDS, {}, false);
  assert.equal(gap.kind, "missing");
  assert.deepEqual(names(gap.blank), names(CDEK_FIELDS));
  assert.deepEqual(names(gap.badChoice), []);
});

test("describeCarrierFormGap: not connected + choice outside its options → badChoice, not blank", () => {
  const gap = describeCarrierFormGap(
    CDEK_FIELDS,
    { account: "acct", securePassword: "secret", contractType: "3" },
    false,
  );
  assert.equal(gap.kind, "missing");
  assert.deepEqual(names(gap.blank), []);
  assert.deepEqual(names(gap.badChoice), ["contractType"]);
});

test("describeCarrierFormGap: not connected + a blank AND a bad choice → both buckets, no field in two", () => {
  const gap = describeCarrierFormGap(
    CDEK_FIELDS,
    { account: "acct", contractType: "3" },
    false,
  );
  assert.equal(gap.kind, "missing");
  assert.deepEqual(names(gap.blank), ["securePassword"]);
  assert.deepEqual(names(gap.badChoice), ["contractType"]);
  const overlap = names(gap.blank).filter((name) =>
    names(gap.badChoice).includes(name),
  );
  assert.deepEqual(
    overlap,
    [],
    "the blank test runs first, so nothing reaches both",
  );
});

test("describeCarrierFormGap: whitespace counts as blank, never as a bad choice", () => {
  const gap = describeCarrierFormGap(
    CDEK_FIELDS,
    { account: "acct", securePassword: "   ", contractType: "   " },
    false,
  );
  assert.equal(gap.kind, "missing");
  // Three situations collapse into «empty» on purpose — a seller cannot act on
  // the difference between an absent key and a string of spaces.
  assert.deepEqual(names(gap.blank), ["securePassword", "contractType"]);
  assert.deepEqual(names(gap.badChoice), []);
});

test("describeCarrierFormGap: not connected + everything filled → ready", () => {
  for (const [providerKey, fields] of Object.entries(CARRIER_CONNECT_FIELDS)) {
    const gap = describeCarrierFormGap(fields, completeValues(fields), false);
    assert.equal(gap.kind, "ready", providerKey);
  }
});

test("describeCarrierFormGap: connected + nothing typed → nothing_supplied, naming no field", () => {
  for (const [providerKey, fields] of Object.entries(CARRIER_CONNECT_FIELDS)) {
    const gap = describeCarrierFormGap(fields, {}, true);
    assert.equal(gap.kind, "nothing_supplied", providerKey);
    // Naming a field here would be wrong: filling ANY one of them clears it.
    assert.equal("blank" in gap, false);
    assert.equal("badChoice" in gap, false);
  }
});

test("describeCarrierFormGap: connected + only whitespace → nothing_supplied", () => {
  const gap = describeCarrierFormGap(YANDEX_FIELDS, { token: "   " }, true);
  assert.equal(gap.kind, "nothing_supplied");
});

test("describeCarrierFormGap: connected + only an out-of-set choice → nothing_supplied", () => {
  // The known imprecision, pinned so it stays a decision rather than an
  // accident: through the interface this state is unreachable, because choice
  // values come from buttons built out of field.options themselves.
  const gap = describeCarrierFormGap(CDEK_FIELDS, { contractType: "3" }, true);
  assert.equal(gap.kind, "nothing_supplied");
});

test("describeCarrierFormGap: connected + one field typed → ready", () => {
  assert.equal(
    describeCarrierFormGap(CDEK_FIELDS, { account: "acct" }, true).kind,
    "ready",
  );
  assert.equal(
    describeCarrierFormGap(CDEK_FIELDS, { contractType: "2" }, true).kind,
    "ready",
  );
});

test("describeCarrierFormGap: values for foreign fields are ignored", () => {
  const gap = describeCarrierFormGap(
    YANDEX_FIELDS,
    { platformStationId: "station-1", token: "tok", contractType: "1" },
    false,
  );
  assert.equal(gap.kind, "ready");
});

// ── carrierFormGapMessage

const CDEK_BY_NAME = Object.fromEntries(
  CDEK_FIELDS.map((field) => [field.name, field]),
);

test("carrierFormGapMessage: one blank field → its label, lowercase, mid-sentence", () => {
  const label = CDEK_BY_NAME.contractType.label;
  const message = carrierFormGapMessage(
    describeCarrierFormGap(
      CDEK_FIELDS,
      { account: "acct", securePassword: "secret" },
      false,
    ),
  );
  assert.ok(message.includes(label), message);
  // capitalizeFieldLabel belongs on the form label, not inside a sentence.
  assert.equal(
    message.includes(capitalizeFieldLabel(label)),
    false,
    "a capital mid-sentence means capitalizeFieldLabel leaked into the message",
  );
});

test("carrierFormGapMessage: two blank fields → both labels, comma-separated, in field order", () => {
  const message = carrierFormGapMessage(
    describeCarrierFormGap(CDEK_FIELDS, { securePassword: "secret" }, false),
  );
  const expected = `${CDEK_BY_NAME.account.label}, ${CDEK_BY_NAME.contractType.label}`;
  assert.ok(message.includes(expected), message);
});

test("carrierFormGapMessage: a bad choice gets its own sentence, and it does not say the field is empty", () => {
  const message = carrierFormGapMessage(
    describeCarrierFormGap(
      CDEK_FIELDS,
      { account: "acct", securePassword: "secret", contractType: "3" },
      false,
    ),
  );
  assert.ok(message.includes(CDEK_BY_NAME.contractType.label), message);
  assert.equal(
    message.includes("не заполнено"),
    false,
    "the field HAS a value; it is the value that cannot be sent",
  );
});

test("carrierFormGapMessage: connected + nothing supplied → one sentence, naming no field", () => {
  const message = carrierFormGapMessage(
    describeCarrierFormGap(CDEK_FIELDS, {}, true),
  );
  assert.equal(message, "Чтобы сохранить, заполните хотя бы одно поле.");
  for (const field of CDEK_FIELDS) {
    assert.equal(message.includes(field.label), false, field.name);
  }
});

test("carrierFormGapMessage: ready → nothing to say", () => {
  assert.equal(
    carrierFormGapMessage(
      describeCarrierFormGap(CDEK_FIELDS, completeValues(CDEK_FIELDS), false),
    ),
    null,
  );
});

test("carrierFormGapMessage: no message ever contains a raw field name", () => {
  // «Never show a raw provider code or an internal key to a seller.»
  for (const [providerKey, fields] of Object.entries(CARRIER_CONNECT_FIELDS)) {
    const gaps = [
      describeCarrierFormGap(fields, {}, false),
      describeCarrierFormGap(fields, {}, true),
      ...fields.map((omitted) => {
        const partial = completeValues(fields);
        delete partial[omitted.name];
        return describeCarrierFormGap(fields, partial, false);
      }),
      ...fields
        .filter((field) => field.kind === "choice")
        .map((choice) =>
          describeCarrierFormGap(
            fields,
            { ...completeValues(fields), [choice.name]: "not-an-option" },
            false,
          ),
        ),
    ];

    for (const gap of gaps) {
      const message = carrierFormGapMessage(gap);
      if (message === null) continue;
      for (const field of fields) {
        assert.equal(
          message.includes(field.name),
          false,
          `${providerKey}: ${field.name} reached the seller`,
        );
      }
    }
  }
});

test("carrierFormGapMessage: no message ever contains a supplied value", () => {
  // These are the seller's carrier credentials. Nothing typed into the form may
  // be echoed back onto the screen, however harmless the sentence looks.
  for (const [providerKey, fields] of Object.entries(CARRIER_CONNECT_FIELDS)) {
    for (const omitted of fields) {
      const values = Object.fromEntries(
        fields
          .filter((field) => field.name !== omitted.name)
          .map((field) => [field.name, `SECRET-${field.name}-MARKER`]),
      );
      const message = carrierFormGapMessage(
        describeCarrierFormGap(fields, values, false),
      );
      if (message === null) continue;
      assert.equal(
        message.includes("SECRET-"),
        false,
        `${providerKey}: a supplied value reached the message`,
      );
    }
  }
});

// ── describeCarrierFormGap: an empty field list (finding 3, 11.09.2026)
//
// Pinned on the UNCHANGED code by a one-off run outside this file, so that the
// twelve isCarrierFormComplete tests above could be shown green with this file
// unedited: describeCarrierFormGap([], {}, false) returned { kind: "ready" } and
// isCarrierFormComplete([], {}, false) returned true — «Подключить» lit on a card
// with no fields, and a POST would have gone out with no credentials. The tests
// below are that pin, inverted.

test("describeCarrierFormGap: an empty field list is no_fields, never ready — not connected", () => {
  assert.deepEqual(describeCarrierFormGap([], {}, false), { kind: "no_fields" });
});

test("describeCarrierFormGap: an empty field list is no_fields — connected too", () => {
  // Used to be nothing_supplied, whose text says «сохранить» and is documented
  // as connected-only; an empty list is not a seller's gap at all.
  assert.deepEqual(describeCarrierFormGap([], {}, true), { kind: "no_fields" });
});

test("describeCarrierFormGap: values supplied for a carrier with no fields still do not make it ready", () => {
  assert.deepEqual(
    describeCarrierFormGap([], { token: "tok", account: "acct" }, false),
    { kind: "no_fields" },
  );
});

test("isCarrierFormComplete: an empty field list never lights the button, in either state", () => {
  assert.equal(isCarrierFormComplete([], {}, false), false);
  assert.equal(isCarrierFormComplete([], {}, true), false);
});

test("carrierFormGapMessage: no_fields says nothing — there is nothing a seller can fix", () => {
  assert.equal(carrierFormGapMessage({ kind: "no_fields" }), null);
});
