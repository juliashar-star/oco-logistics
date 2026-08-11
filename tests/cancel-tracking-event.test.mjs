import assert from "node:assert/strict";
import test from "node:test";

import { resolveCancelTrackingEvent } from "../apps/web/lib/shipments/cancel-tracking-event.ts";

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
