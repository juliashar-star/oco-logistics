import assert from "node:assert/strict";
import test from "node:test";

import { capitalizeFieldLabel } from "../apps/web/lib/carriers/capitalize-field-label.ts";
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
