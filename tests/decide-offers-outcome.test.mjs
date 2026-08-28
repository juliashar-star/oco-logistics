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

test("a filtered adapter beside an auth failure is a carrier problem, not ours", () => {
  // Reversed 28.08. We still cannot say «нет вариантов» — one carrier never
  // answered — and this outcome does not: it hands the browser both statuses,
  // which are then named separately. What changed is that we no longer answer
  // «попробуйте позже» either, which asserted a cause we had not established.
  assert.equal(
    decide(["parcel_too_large", "auth_failed"]),
    "carriers_unreachable",
  );
});

test("MIXED FAULTS ARE REPORTED AS MIXED, not collapsed into our own error", () => {
  // Reversed 28.08. The old reasoning was half right: aggregating a mixed set
  // into «нет вариантов» IS a claim we cannot back. But `server_error` was not
  // silence — it claimed «попробуйте позже», the same words a bug in our code
  // produces. This outcome aggregates nothing and names each carrier instead.
  assert.equal(
    decide(["no_delivery_options", "auth_failed"]),
    "carriers_unreachable",
  );
  assert.equal(
    decide(["no_delivery_options", "timed_out"]),
    "carriers_unreachable",
  );
  assert.equal(
    decide(["no_delivery_options", "failed"]),
    "carriers_unreachable",
  );
  assert.equal(decide(["auth_failed", "timed_out"]), "carriers_unreachable");
});

// ── the weld that this slice undoes ────────────────────────────────────────
// Until 28.08 one test asserted that «everything broke» and «nothing was asked»
// both mean server_error. They are opposite causes — one is the carriers, one is
// us — and holding them under a single name is what let the seller be told our
// generic retry sentence for a carrier outage. Two tests now, so the split is
// visible in the names.

test("EVERY CARRIER DOWN is the carriers' problem, and the seller is told which", () => {
  assert.equal(decide(["failed"]), "carriers_unreachable");
  assert.equal(decide(["timed_out"]), "carriers_unreachable");
  assert.equal(decide(["failed", "timed_out"]), "carriers_unreachable");
  assert.equal(decide(["failed", "failed"]), "carriers_unreachable");
});

test("NOTHING WAS ASKED is OUR problem, and stays a server error", () => {
  // An empty status list means the fan-out returned no entries at all. No
  // carrier can be named because none was reached, and «попробуйте позже» is
  // honest here: the next attempt runs our code again.
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

test("an unknown status is not swept into «the carriers are down» either", () => {
  // The new outcome is an ALLOW-LIST, not `!== "ok"`. A sixth status beside a
  // known carrier-side one must still surface as ours, or the parcel_too_large
  // trap reopens one door down: a status nothing understands would be reported
  // to the seller as a carrier outage.
  assert.equal(decide(["failed", "some_future_status"]), "server_error");
  assert.equal(decide(["timed_out", "some_future_status"]), "server_error");
});
