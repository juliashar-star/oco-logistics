import assert from "node:assert/strict";
import test from "node:test";

import {
  FREE_CANCEL_UNKNOWN_RU,
  FREE_CANCEL_UNTIL_COURIER_PICKUP_RU,
  FREE_CANCEL_UNTIL_WAREHOUSE_INTAKE_RU,
  offerFreeCancelNote,
} from "../apps/web/lib/shipments/offer-free-cancel-note.ts";
import {
  FREE_CANCEL_BOUNDARY_UNKNOWN,
  FREE_CANCEL_UNTIL_COURIER_PICKUP,
  FREE_CANCEL_UNTIL_WAREHOUSE_INTAKE,
} from "../packages/core/src/carrier-adapter/free-cancel-boundaries.ts";
import { PROTOTYPE_KEY_CASES } from "./helpers/prototype-keys.mjs";

// ── every key gets its own sentence ────────────────────────────────────────

test("until_courier_pickup → the courier boundary", () => {
  assert.equal(
    offerFreeCancelNote(FREE_CANCEL_UNTIL_COURIER_PICKUP),
    FREE_CANCEL_UNTIL_COURIER_PICKUP_RU,
  );
});

test("until_warehouse_intake → the warehouse boundary", () => {
  assert.equal(
    offerFreeCancelNote(FREE_CANCEL_UNTIL_WAREHOUSE_INTAKE),
    FREE_CANCEL_UNTIL_WAREHOUSE_INTAKE_RU,
  );
});

test("unknown → the «we do not know» sentence", () => {
  assert.equal(
    offerFreeCancelNote(FREE_CANCEL_BOUNDARY_UNKNOWN),
    FREE_CANCEL_UNKNOWN_RU,
  );
});

test("the three sentences are distinct", () => {
  const sentences = new Set([
    offerFreeCancelNote(FREE_CANCEL_UNTIL_COURIER_PICKUP),
    offerFreeCancelNote(FREE_CANCEL_UNTIL_WAREHOUSE_INTAKE),
    offerFreeCancelNote(FREE_CANCEL_BOUNDARY_UNKNOWN),
  ]);
  assert.equal(sentences.size, 3);
});

test("surrounding whitespace does not hide a key", () => {
  assert.equal(
    offerFreeCancelNote(`  ${FREE_CANCEL_UNTIL_WAREHOUSE_INTAKE}  `),
    FREE_CANCEL_UNTIL_WAREHOUSE_INTAKE_RU,
  );
});

// ── nothing usable → the unknown sentence, NEVER an empty line ─────────────

for (const [label, boundary] of [
  ["a missing key", undefined],
  ["null", null],
  ["an empty string", ""],
  ["whitespace only", "   "],
  ["newlines only", "\n\t "],
  ["an unrecognised key", "until_something_else"],
  ["a key with a suffix", `${FREE_CANCEL_UNTIL_COURIER_PICKUP}_v2`],
  ["a key uppercased", FREE_CANCEL_UNTIL_COURIER_PICKUP.toUpperCase()],
  ["a carrier name", "cdek"],
  ["a number", 1],
  ["a boolean", true],
  ["an object", { boundary: FREE_CANCEL_UNTIL_COURIER_PICKUP }],
  ["an array", [FREE_CANCEL_UNTIL_COURIER_PICKUP]],
  // Object.prototype keys: with an object literal as the table these would
  // resolve to a function and be rendered on the card. The list is shared and
  // identical at every site — tests/helpers/prototype-keys.mjs says why.
  ...PROTOTYPE_KEY_CASES,
]) {
  test(`${label} → the unknown sentence, not a blank line`, () => {
    const note = offerFreeCancelNote(boundary);
    assert.equal(note, FREE_CANCEL_UNKNOWN_RU);
    assert.notEqual(note, "");
  });
}

test("there is no input that produces an empty card line", () => {
  // The whole point of the line: a card without it reads as a promise of
  // freer cancellation, so «no sentence» must be unreachable.
  for (const boundary of [
    FREE_CANCEL_UNTIL_COURIER_PICKUP,
    FREE_CANCEL_UNTIL_WAREHOUSE_INTAKE,
    FREE_CANCEL_BOUNDARY_UNKNOWN,
    undefined,
    null,
    "",
    "   ",
    "nonsense",
    42,
  ]) {
    assert.ok(offerFreeCancelNote(boundary).trim().length > 0);
  }
});

// ── wording pin ────────────────────────────────────────────────────────────

test("the seller-facing cancellation terms, character for character", () => {
  // THE ONE PLACE THESE LITERALS ARE WRITTEN OUT — same role as the pins in
  // tests/cancel-request-message.test.mjs. The assertions above compare against
  // the constants, which pins behaviour but says nothing about the words.
  assert.equal(
    FREE_CANCEL_UNTIL_COURIER_PICKUP_RU,
    "Бесплатная отмена — пока курьер не приехал к отправителю.",
  );
  assert.equal(
    FREE_CANCEL_UNTIL_WAREHOUSE_INTAKE_RU,
    "Бесплатная отмена — пока посылка не поступила на склад перевозчика.",
  );
  assert.equal(
    FREE_CANCEL_UNKNOWN_RU,
    "Отмена может стать платной после того, как перевозчик начнёт работу с посылкой.",
  );
  // The unknown line must not promise free cancellation — it is the one shown
  // when nothing has been measured.
  assert.doesNotMatch(FREE_CANCEL_UNKNOWN_RU, /Бесплатн/);
});
