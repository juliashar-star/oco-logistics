import assert from "node:assert/strict";
import test from "node:test";

import { pickEarliestOfferExpiry } from "../apps/web/lib/date/pick-earliest-offer-expiry.ts";

test("pickEarliestOfferExpiry: empty list → null", () => {
  assert.equal(pickEarliestOfferExpiry([]), null);
});

test("pickEarliestOfferExpiry: no usable expiry → null", () => {
  assert.equal(
    pickEarliestOfferExpiry([
      { expiresAt: "" },
      { expiresAt: "  " },
      { expiresAt: "not-a-date" },
    ]),
    null,
  );
});

test("pickEarliestOfferExpiry: returns the earliest among parseable", () => {
  const earliest = pickEarliestOfferExpiry([
    { expiresAt: "2026-07-27T12:00:00.000Z" },
    { expiresAt: "bad" },
    { expiresAt: "2026-07-27T10:00:00.000Z" },
    { expiresAt: "2026-07-27T11:00:00.000Z" },
  ]);
  assert.ok(earliest instanceof Date);
  assert.equal(earliest.toISOString(), "2026-07-27T10:00:00.000Z");
});
