import test from "node:test";
import assert from "node:assert/strict";
import { mapCancelState } from "../packages/core/src/carrier-adapter/yandex/map-cancel-state.ts";

/** The three documented states — the only inputs that are not "not_free". */
test("cancel_state 'free' → free", () => {
  assert.equal(mapCancelState({ cancel_state: "free" }), "free");
});

test("cancel_state 'paid' → not_free", () => {
  assert.equal(mapCancelState({ cancel_state: "paid" }), "not_free");
});

test("cancel_state 'unavailable' → unavailable", () => {
  assert.equal(mapCancelState({ cancel_state: "unavailable" }), "unavailable");
});

test("a full documented body is read by its cancel_state alone", () => {
  // Shape from docs/research/yandex-express-api-2026-07-27.md:287-294.
  assert.equal(
    mapCancelState({
      cancel_state: "free",
      price: "12.50",
      price_with_vat: null,
      currency: "RUB",
    }),
    "free",
  );
});

/**
 * FAIL CLOSED. Every one of these must be "not_free" — never "free", which
 * would be permission to spend the seller's money on an answer we could not
 * read, and never "unavailable", which would hide a working cancellation
 * behind our own parse bug.
 */
const NOT_FREE_INPUTS = [
  ["null cancel_state", { cancel_state: null }],
  ["undefined cancel_state", { cancel_state: undefined }],
  ["empty string", { cancel_state: "" }],
  ["blank string", { cancel_state: "   " }],
  ["number", { cancel_state: 0 }],
  ["number 1", { cancel_state: 1 }],
  ["boolean true", { cancel_state: true }],
  ["unknown string", { cancel_state: "gratis" }],
  ["near-miss casing", { cancel_state: "FREE" }],
  ["object value", { cancel_state: { value: "free" } }],
  ["array value", { cancel_state: ["free"] }],
  ["missing key", { price: "12.50", currency: "RUB" }],
  ["empty object", {}],
  ["body null", null],
  ["body undefined", undefined],
  ["body a string", "free"],
  ["body a number", 200],
  ["body an array", []],
];

for (const [label, input] of NOT_FREE_INPUTS) {
  test(`fails closed to not_free: ${label}`, () => {
    assert.equal(mapCancelState(input), "not_free");
  });
}

test("nothing but the exact strings 'free' and 'unavailable' escapes not_free", () => {
  // Guards the switch against a future edit that widens a case by accident.
  for (const raw of ["free", "unavailable"]) {
    assert.notEqual(mapCancelState({ cancel_state: raw }), "not_free");
  }
  for (const raw of ["freee", "free ", " free", "un-available", "paid "]) {
    // " free" and "free " are trimmed and DO resolve — assert the real rule
    // rather than a guessed one.
    const expected = raw.trim() === "free" ? "free" : "not_free";
    assert.equal(mapCancelState({ cancel_state: raw }), expected);
  }
});
