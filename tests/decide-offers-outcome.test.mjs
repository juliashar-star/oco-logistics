import assert from "node:assert/strict";
import test from "node:test";

import { decideOffersOutcome } from "../apps/web/lib/shipments/decide-offers-outcome.ts";

const decide = (statuses, hasOffers = false) =>
  decideOffersOutcome({ hasOffers, statuses });

// ── serving a list ─────────────────────────────────────────────────────────

test("offers present → serve them", () => {
  assert.equal(decide([], true), "offers");
  assert.equal(decide(["failed"], true), "offers");
});

test("an adapter answered ok → serve, even with an empty list", () => {
  // Yandex documents ok-with-nothing, and dedupe can empty a list that arrived.
  assert.equal(decide(["ok"]), "offers");
  assert.equal(decide(["ok", "auth_failed"]), "offers");
});

// ── nothing to sell, nothing broken ────────────────────────────────────────

test("every adapter had nothing → no delivery options", () => {
  assert.equal(decide(["no_delivery_options"]), "no_delivery_options");
  assert.equal(
    decide(["no_delivery_options", "no_delivery_options"]),
    "no_delivery_options",
  );
});

test("every adapter filtered on parcel limits → no delivery options, NOT an error", () => {
  // 35 kg to a Yandex ПВЗ: next_day 30, express 20, courier 10 all drop out,
  // and a point destination is already narrowed to that point's carrier, so
  // CDEK is not in the list. Nothing failed; a retry can never help.
  assert.equal(
    decide(["parcel_too_large", "parcel_too_large", "parcel_too_large"]),
    "no_delivery_options",
  );
});

test("one filtered beside others with nothing → no delivery options", () => {
  assert.equal(
    decide(["parcel_too_large", "no_delivery_options"]),
    "no_delivery_options",
  );
  assert.equal(
    decide(["no_delivery_options", "parcel_too_large", "no_delivery_options"]),
    "no_delivery_options",
  );
});

// ── faults ─────────────────────────────────────────────────────────────────

test("every adapter refused our credentials → auth failed", () => {
  assert.equal(decide(["auth_failed"]), "auth_failed");
  assert.equal(decide(["auth_failed", "auth_failed"]), "auth_failed");
});

test("a filtered adapter beside an auth failure is still a server error", () => {
  // We cannot say «нет вариантов»: one carrier never answered, so whether the
  // seller has options is unknown. Same reasoning as any other mixed fault.
  assert.equal(decide(["parcel_too_large", "auth_failed"]), "server_error");
});

test("MIXED FAULTS ARE UNCHANGED: nothing-to-sell beside a fault stays a server error", () => {
  // Pinned deliberately. This is today's behaviour and this slice does not
  // touch it — a carrier that did not answer means we do not know.
  assert.equal(decide(["no_delivery_options", "auth_failed"]), "server_error");
  assert.equal(decide(["no_delivery_options", "timed_out"]), "server_error");
  assert.equal(decide(["no_delivery_options", "failed"]), "server_error");
  assert.equal(decide(["auth_failed", "timed_out"]), "server_error");
});

test("everything broke, or nothing was asked → server error", () => {
  assert.equal(decide(["failed"]), "server_error");
  assert.equal(decide(["timed_out"]), "server_error");
  assert.equal(decide([]), "server_error");
});

test("an unknown future status never collapses to a statement", () => {
  // A sixth status must default to the honest answer, not be swept into
  // «нет вариантов» — the same trap parcel_too_large fell into.
  assert.equal(decide(["some_future_status"]), "server_error");
  assert.equal(
    decide(["no_delivery_options", "some_future_status"]),
    "server_error",
  );
});
