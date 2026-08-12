import assert from "node:assert/strict";
import test from "node:test";

import { mapCdekCancelWindow } from "../packages/core/src/carrier-adapter/cdek/map-cancel-window.ts";
import { mapCdekStatusToShipmentStatus } from "../packages/core/src/carrier-adapter/cdek/map-status.ts";

const at = (iso, code, extra = {}) => ({
  code,
  date_time: iso,
  name: code,
  ...extra,
});

const T0 = "2026-08-01T10:00:00+0300";
const T1 = "2026-08-02T10:00:00+0300";
const T2 = "2026-08-03T10:00:00+0300";

// ── each boundary code, judged as the newest entry ─────────────────────────

for (const code of ["ACCEPTED", "CREATED"]) {
  test(`newest ${code} → deletable`, () => {
    assert.equal(mapCdekCancelWindow([at(T0, code)]), "deletable");
  });
}

for (const code of ["DELIVERED", "NOT_DELIVERED", "REMOVED"]) {
  test(`newest ${code} → unavailable`, () => {
    assert.equal(mapCdekCancelWindow([at(T0, code)]), "unavailable");
  });
}

test("newest RECEIVED_AT_SHIPMENT_WAREHOUSE → not_free (the boundary itself)", () => {
  // Приложение 1 status 3: from here on only the chargeable refusal remains.
  assert.equal(
    mapCdekCancelWindow([at(T0, "RECEIVED_AT_SHIPMENT_WAREHOUSE")]),
    "not_free",
  );
});

for (const code of [
  "TAKEN_BY_COURIER",
  "SENT_TO_RECIPIENT_CITY",
  "ACCEPTED_AT_PICK_UP_POINT",
  "RETURNED_TO_SENDER_CITY_WAREHOUSE",
  "INVALID",
]) {
  test(`newest ${code} (a known moved status) → not_free`, () => {
    assert.equal(mapCdekCancelWindow([at(T0, code)]), "not_free");
  });
}

// ── order independence: the point of the sort ──────────────────────────────

test("newest-first and oldest-first arrays with the SAME entries agree", () => {
  const oldestFirst = [
    at(T0, "ACCEPTED"),
    at(T1, "CREATED"),
    at(T2, "RECEIVED_AT_SHIPMENT_WAREHOUSE"),
  ];
  const newestFirst = [...oldestFirst].reverse();

  assert.equal(mapCdekCancelWindow(oldestFirst), "not_free");
  assert.equal(mapCdekCancelWindow(newestFirst), "not_free");
  assert.equal(
    mapCdekCancelWindow(oldestFirst),
    mapCdekCancelWindow(newestFirst),
  );
});

test("a shuffled array still answers by the newest entry, not by position", () => {
  const shuffled = [
    at(T1, "CREATED"),
    at(T0, "ACCEPTED"),
    at(T2, "DELIVERED"),
  ];
  assert.equal(mapCdekCancelWindow(shuffled), "unavailable");
});

test("still deletable when the newest of several is CREATED", () => {
  assert.equal(
    mapCdekCancelWindow([at(T1, "CREATED"), at(T0, "ACCEPTED")]),
    "deletable",
  );
});

// ── deleted entries ────────────────────────────────────────────────────────

test("deleted:true newest entry is skipped in favour of the one under it", () => {
  const statuses = [
    at(T2, "DELIVERED", { deleted: true }),
    at(T1, "CREATED"),
  ];
  // Without the skip this would read "unavailable" and refuse a cancellation
  // that is genuinely still free.
  assert.equal(mapCdekCancelWindow(statuses), "deletable");
});

test("all entries deleted → unknown, never a guess", () => {
  assert.equal(
    mapCdekCancelWindow([
      at(T1, "CREATED", { deleted: true }),
      at(T0, "ACCEPTED", { deleted: true }),
    ]),
    "unknown",
  );
});

// ── unreadable input → unknown ─────────────────────────────────────────────

test("empty array → unknown", () => {
  assert.equal(mapCdekCancelWindow([]), "unknown");
});

test("not an array → unknown", () => {
  for (const input of [null, undefined, {}, "CREATED", 7]) {
    assert.equal(mapCdekCancelWindow(input), "unknown");
  }
});

test("unknown code → unknown, NOT not_free", () => {
  // A code outside Приложение 1 means we cannot place the parcel at all.
  assert.equal(mapCdekCancelWindow([at(T0, "SOME_NEW_STATUS")]), "unknown");
});

test("malformed date_time drops the entry", () => {
  assert.equal(
    mapCdekCancelWindow([{ code: "CREATED", date_time: "not-a-date" }]),
    "unknown",
  );
  // The readable one under it decides — EXCEPT that a drop cannot be allowed to
  // produce "deletable". This assertion used to expect "deletable" and was
  // changed deliberately: it had recorded the permissive behaviour, which is
  // the defect the one-sided guard now closes. See the unreadable-newest tests
  // below.
  assert.equal(
    mapCdekCancelWindow([
      { code: "DELIVERED", date_time: "not-a-date" },
      at(T0, "CREATED"),
    ]),
    "unknown",
  );
});

test("missing code or date_time drops the entry", () => {
  assert.equal(mapCdekCancelWindow([{ date_time: T0 }]), "unknown");
  assert.equal(mapCdekCancelWindow([{ code: "CREATED" }]), "unknown");
  assert.equal(mapCdekCancelWindow([{ code: "   ", date_time: T0 }]), "unknown");
  assert.equal(mapCdekCancelWindow([null, 7, "x"]), "unknown");
});

// ── a drop can only ever move the answer EARLIER, so it is fenced ──────────

test("unreadable newest over a CREATED → unknown, NOT deletable", () => {
  // The dangerous shape: a RECEIVED_AT_SHIPMENT_WAREHOUSE we could not parse
  // would be dropped, leaving CREATED as the newest and authorising a delete on
  // an order that has already reached the warehouse.
  assert.equal(
    mapCdekCancelWindow([
      { code: "RECEIVED_AT_SHIPMENT_WAREHOUSE", date_time: "not-a-date" },
      at(T0, "CREATED"),
    ]),
    "unknown",
  );
});

test("unreadable newest over a moved code → still not_free, the guard did not spread", () => {
  assert.equal(
    mapCdekCancelWindow([
      { code: "DELIVERED", date_time: "not-a-date" },
      at(T0, "TAKEN_BY_COURIER"),
    ]),
    "not_free",
  );
});

test("unreadable newest over a terminal code → still unavailable", () => {
  assert.equal(
    mapCdekCancelWindow([
      { code: "SOMETHING", date_time: "not-a-date" },
      at(T0, "DELIVERED"),
    ]),
    "unavailable",
  );
});

test("deleted:true above a CREATED still yields deletable — a retraction is not a parse failure", () => {
  assert.equal(
    mapCdekCancelWindow([
      at(T2, "RECEIVED_AT_SHIPMENT_WAREHOUSE", { deleted: true }),
      at(T0, "CREATED"),
    ]),
    "deletable",
  );
});

test("a clean array with no drops still yields deletable — the guard does not fire without cause", () => {
  assert.equal(
    mapCdekCancelWindow([at(T1, "CREATED"), at(T0, "ACCEPTED")]),
    "deletable",
  );
});

// ── the two vocabularies must stay in step ─────────────────────────────────

test("every boundary code this file names is known to mapCdekStatusToShipmentStatus", () => {
  // KEY PRESENCE, not the resolved value: mapCdekStatusToShipmentStatus
  // defaults to null for anything it does not know, so asserting non-null is
  // what proves the code is actually in Приложение 1 and not silently drifting
  // into the "unknown" branch of the window rule.
  for (const code of [
    "ACCEPTED",
    "CREATED",
    "DELIVERED",
    "NOT_DELIVERED",
    "REMOVED",
    "RECEIVED_AT_SHIPMENT_WAREHOUSE",
  ]) {
    assert.notEqual(
      mapCdekStatusToShipmentStatus(code),
      null,
      `${code} must exist in map-status.ts`,
    );
  }
});
