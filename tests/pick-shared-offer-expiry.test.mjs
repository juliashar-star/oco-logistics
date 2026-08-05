import assert from "node:assert/strict";
import test from "node:test";

import { pickSharedOfferExpiry } from "../apps/web/lib/date/pick-shared-offer-expiry.ts";

const T1 = "2026-08-05T10:00:00Z";
const T2 = "2026-08-05T11:30:00Z";

test("pickSharedOfferExpiry: all offers share one expiry → that expiry", () => {
  const shared = pickSharedOfferExpiry([
    { expiresAt: T1 },
    { expiresAt: T1 },
    { expiresAt: T1 },
  ]);
  assert.ok(shared instanceof Date);
  assert.equal(shared.toISOString(), new Date(T1).toISOString());
});

test("pickSharedOfferExpiry: expiries differ → null (no «earliest» fallback)", () => {
  assert.equal(
    pickSharedOfferExpiry([{ expiresAt: T1 }, { expiresAt: T2 }]),
    null,
  );
});

test("pickSharedOfferExpiry: one offer lacks an expiry → null (the CDEK-on-door case)", () => {
  // CDEK offers always carry expiresAt: "" — a Yandex deadline must not be
  // printed over them.
  assert.equal(
    pickSharedOfferExpiry([{ expiresAt: T1 }, { expiresAt: "" }]),
    null,
  );
  assert.equal(
    pickSharedOfferExpiry([{ expiresAt: "   " }, { expiresAt: T1 }]),
    null,
  );
});

test("pickSharedOfferExpiry: empty list → null", () => {
  assert.equal(pickSharedOfferExpiry([]), null);
});

test("pickSharedOfferExpiry: single offer with an expiry → that expiry", () => {
  const shared = pickSharedOfferExpiry([{ expiresAt: T1 }]);
  assert.ok(shared instanceof Date);
  assert.equal(shared.toISOString(), new Date(T1).toISOString());
});

test("pickSharedOfferExpiry: an unparseable expiry → null, never shown as a date", () => {
  assert.equal(
    pickSharedOfferExpiry([{ expiresAt: T1 }, { expiresAt: "not-a-date" }]),
    null,
  );
  assert.equal(pickSharedOfferExpiry([{ expiresAt: "not-a-date" }]), null);
});

test("pickSharedOfferExpiry: same instant spelled two ways still counts as shared", () => {
  // Compared by instant, not by raw string.
  const shared = pickSharedOfferExpiry([
    { expiresAt: "2026-08-05T10:00:00Z" },
    { expiresAt: "2026-08-05T10:00:00.000Z" },
  ]);
  assert.ok(shared instanceof Date);
  assert.equal(shared.toISOString(), new Date(T1).toISOString());
});
