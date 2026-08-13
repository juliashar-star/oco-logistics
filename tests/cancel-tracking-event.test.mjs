import assert from "node:assert/strict";
import test from "node:test";

import {
  isCancelNotSentReason,
  resolveCancelTrackingEvent,
} from "../apps/web/lib/shipments/cancel-tracking-event.ts";
import {
  OCO_CANCEL_ALREADY_REQUESTED,
  OCO_CANCEL_ALREADY_REQUESTED_TEXT_RU,
  OCO_CANCEL_REQUESTED,
  OCO_CANCEL_REQUESTED_TEXT_RU,
} from "../packages/core/src/carrier-adapter/cancel-event-codes.ts";
import {
  PROTOTYPE_KEYS,
  PROTOTYPE_KEY_CASES,
} from "./helpers/prototype-keys.mjs";

/** Minimal CarrierCancelResult; every field the function reads is overridable. */
const result = (over = {}) => ({
  accepted: true,
  providerStatus: "",
  ...over,
});

// ── the code is present → an event is written ──────────────────────────────

test("reason wins over providerStatus for the code", () => {
  assert.deepEqual(
    resolveCancelTrackingEvent(
      result({ reason: "cancellation_started", providerStatus: "CREATED" }),
    ),
    { statusCode: "cancellation_started", statusText: "cancellation_started" },
  );
});

test("providerStatus is the code when there is no reason", () => {
  assert.deepEqual(
    resolveCancelTrackingEvent(result({ providerStatus: "cancelled" })),
    { statusCode: "cancelled", statusText: "cancelled" },
  );
});

test("description is preferred for the human text", () => {
  assert.deepEqual(
    resolveCancelTrackingEvent(
      result({ providerStatus: "cancelled", description: "Отменено" }),
    ),
    { statusCode: "cancelled", statusText: "Отменено" },
  );
});

test("description wins over reason for text, reason still names the code", () => {
  assert.deepEqual(
    resolveCancelTrackingEvent(
      result({
        reason: "cancellation_started",
        providerStatus: "CREATED",
        description: "Заявка создана; заказ отменяется",
      }),
    ),
    {
      statusCode: "cancellation_started",
      statusText: "Заявка создана; заказ отменяется",
    },
  );
});

// ── nothing nameable → null, no blank row ──────────────────────────────────

test("empty providerStatus and no reason → null", () => {
  // Exactly what cancelExpressOrder returns when the post-cancel info read
  // fails: accepted true, providerStatus "".
  assert.equal(resolveCancelTrackingEvent(result()), null);
});

test("whitespace-only providerStatus → null", () => {
  assert.equal(
    resolveCancelTrackingEvent(result({ providerStatus: "   " })),
    null,
  );
});

test("whitespace-only reason → null even when it is present", () => {
  assert.equal(
    resolveCancelTrackingEvent(result({ reason: "  ", providerStatus: "" })),
    null,
  );
});

test("a description alone is NOT enough — text without a code is not an event", () => {
  assert.equal(
    resolveCancelTrackingEvent(
      result({ providerStatus: "", description: "Отменено" }),
    ),
    null,
  );
});

// ── nothing was SENT → null, for a different reason ────────────────────────

test("OCO_CANCEL_ALREADY_REQUESTED → null: no request was made, so no event", () => {
  // The exact shape cancelCdekOrder returns from its pendingDelete branch —
  // providerStatus is CDEK's own word for the queued request, and the row is
  // fully nameable. It is still not written: nothing was sent.
  assert.equal(
    resolveCancelTrackingEvent({
      accepted: true,
      providerStatus: "ACCEPTED",
      reason: OCO_CANCEL_ALREADY_REQUESTED,
      description: OCO_CANCEL_ALREADY_REQUESTED_TEXT_RU,
    }),
    null,
  );
});

test("the same for the other measured queue state", () => {
  assert.equal(
    resolveCancelTrackingEvent({
      accepted: true,
      providerStatus: "WAITING",
      reason: OCO_CANCEL_ALREADY_REQUESTED,
      description: OCO_CANCEL_ALREADY_REQUESTED_TEXT_RU,
    }),
    null,
  );
});

test("ten presses would write ten rows — the guard makes it zero", () => {
  const written = Array.from({ length: 10 }, () =>
    resolveCancelTrackingEvent(
      result({
        providerStatus: "ACCEPTED",
        reason: OCO_CANCEL_ALREADY_REQUESTED,
        description: OCO_CANCEL_ALREADY_REQUESTED_TEXT_RU,
      }),
    ),
  ).filter((event) => event !== null);
  assert.deepEqual(written, []);
});

test("surrounding whitespace does not hide the code", () => {
  assert.equal(
    resolveCancelTrackingEvent(
      result({
        providerStatus: "ACCEPTED",
        reason: `  ${OCO_CANCEL_ALREADY_REQUESTED}  `,
      }),
    ),
    null,
  );
});

// ── a real request still writes its row ────────────────────────────────────

test("OCO_CANCEL_REQUESTED still writes an event — we DID ask", () => {
  // The opposite member of the same OCO_* family. A rule keyed on the prefix
  // instead of the exact code would silently drop every real cancellation.
  assert.deepEqual(
    resolveCancelTrackingEvent(
      result({
        providerStatus: "ACCEPTED",
        reason: OCO_CANCEL_REQUESTED,
        description: OCO_CANCEL_REQUESTED_TEXT_RU,
      }),
    ),
    {
      statusCode: OCO_CANCEL_REQUESTED,
      statusText: OCO_CANCEL_REQUESTED_TEXT_RU,
    },
  );
});

test("the skip is by exact code, never by shape", () => {
  for (const reason of [
    `${OCO_CANCEL_ALREADY_REQUESTED}_AND_MORE`,
    `NOT_${OCO_CANCEL_ALREADY_REQUESTED}`,
    OCO_CANCEL_ALREADY_REQUESTED.toLowerCase(),
    "OCO_CANCEL_SOMETHING_ELSE",
    "cancellation_started",
  ]) {
    const event = resolveCancelTrackingEvent(result({ reason }));
    assert.notEqual(event, null, `${reason} must still be recorded`);
    assert.equal(event.statusCode, reason);
  }
});

test("the skip reads the reason, not a providerStatus that happens to match", () => {
  // No carrier emits our namespaced code as a status; if one ever did, dropping
  // the row would hide a real event. The reason is the only thing ОСО sets.
  const event = resolveCancelTrackingEvent(
    result({ providerStatus: OCO_CANCEL_ALREADY_REQUESTED }),
  );
  assert.notEqual(event, null);
  assert.equal(event.statusCode, OCO_CANCEL_ALREADY_REQUESTED);
});

test("no reason at all → decided by providerStatus exactly as before", () => {
  assert.deepEqual(resolveCancelTrackingEvent(result({ providerStatus: "cancelled" })), {
    statusCode: "cancelled",
    statusText: "cancelled",
  });
  assert.equal(resolveCancelTrackingEvent(result({ providerStatus: "" })), null);
});

// ── isCancelNotSentReason: which null the route is looking at ──────────────

test("the exact code → true", () => {
  assert.equal(isCancelNotSentReason(OCO_CANCEL_ALREADY_REQUESTED), true);
});

test("surrounding whitespace still → true", () => {
  assert.equal(
    isCancelNotSentReason(`  ${OCO_CANCEL_ALREADY_REQUESTED}  `),
    true,
  );
});

test("OCO_CANCEL_REQUESTED → false: that one WAS sent", () => {
  assert.equal(isCancelNotSentReason(OCO_CANCEL_REQUESTED), false);
});

for (const [label, reason] of [
  ["an unknown string", "cancellation_started"],
  ["an unknown OCO-looking code", "OCO_CANCEL_SOMETHING_NEW"],
  ["the code with a suffix", `${OCO_CANCEL_ALREADY_REQUESTED}_AND_MORE`],
  ["the code lowercased", OCO_CANCEL_ALREADY_REQUESTED.toLowerCase()],
  ["an empty string", ""],
  ["whitespace only", "   "],
  ["a missing reason", undefined],
  ["null", null],
  ["a number", 409],
  ["an object", { reason: OCO_CANCEL_ALREADY_REQUESTED }],
  ["an array", [OCO_CANCEL_ALREADY_REQUESTED]],
  ["a boolean", true],
  // Object.prototype names. The set here is a Set, so it walks no prototype
  // chain and these were never in danger — they are enumerated because every
  // lookup test feeds in the same list, and this file is a plausible source to
  // copy the next one from. See tests/helpers/prototype-keys.mjs.
  ...PROTOTYPE_KEY_CASES,
]) {
  test(`${label} → false`, () => {
    assert.equal(isCancelNotSentReason(reason), false);
  });
}

test("prototype names are not «not sent», and still record an event", () => {
  // The other half of the same guard: the resolver must not drop a row for a
  // reason that only LOOKS like a member of the skip list.
  for (const key of PROTOTYPE_KEYS) {
    assert.equal(isCancelNotSentReason(key), false, key);
    const event = resolveCancelTrackingEvent(result({ reason: key }));
    assert.notEqual(event, null, `${key} must still be recorded`);
    assert.equal(event.statusCode, key);
  }
});

test("the predicate and the resolver never disagree", () => {
  // They read one set. If a reason says «not sent», the resolver must write
  // nothing for it — a route that logged «nothing sent» while a row appeared
  // would be describing a system that does not exist.
  for (const reason of [
    OCO_CANCEL_ALREADY_REQUESTED,
    OCO_CANCEL_REQUESTED,
    "cancellation_started",
    "",
  ]) {
    if (isCancelNotSentReason(reason)) {
      assert.equal(
        resolveCancelTrackingEvent(result({ reason, providerStatus: "ACCEPTED" })),
        null,
      );
    }
  }
});

// ── trimming and the non-nullable text column ──────────────────────────────

test("code and text are trimmed", () => {
  assert.deepEqual(
    resolveCancelTrackingEvent(
      result({ providerStatus: "  cancelled  ", description: "  Отменено  " }),
    ),
    { statusCode: "cancelled", statusText: "Отменено" },
  );
});

test("blank description falls back to the code, never to an empty text", () => {
  const event = resolveCancelTrackingEvent(
    result({ providerStatus: "cancelled", description: "   " }),
  );
  assert.deepEqual(event, { statusCode: "cancelled", statusText: "cancelled" });
  assert.notEqual(event.statusText, "");
});

test("an event is either fully populated or absent — never half a row", () => {
  const inputs = [
    result(),
    result({ providerStatus: " " }),
    result({ reason: "cancellation_started" }),
    result({ providerStatus: "cancelled" }),
    result({ providerStatus: "cancelled", description: "Отменено" }),
    result({ reason: " ", description: " " }),
  ];
  for (const input of inputs) {
    const event = resolveCancelTrackingEvent(input);
    if (event === null) continue;
    assert.ok(event.statusCode.trim().length > 0, "statusCode must be non-blank");
    assert.ok(event.statusText.trim().length > 0, "statusText must be non-blank");
  }
});
