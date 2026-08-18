import assert from "node:assert/strict";
import test from "node:test";

import { needsSuggestionPick } from "../apps/web/lib/address/needs-suggestion-pick.ts";

test("empty text and empty confirmation → false (nothing entered yet)", () => {
  assert.equal(needsSuggestionPick("", ""), false);
});

test("text without confirmation → true (typed by hand, never picked)", () => {
  assert.equal(needsSuggestionPick("Ленина, 5", ""), true);
});

test("text with confirmation → false (came from the suggestion list)", () => {
  assert.equal(needsSuggestionPick("Ленина, 5", "Москва, ул. Ленина, д. 5"), false);
});

test("whitespace-only text → false (whitespace is not an entry)", () => {
  assert.equal(needsSuggestionPick("   ", ""), false);
});

test("whitespace-only confirmation → true (whitespace is not a confirmation)", () => {
  assert.equal(needsSuggestionPick("Ленина, 5", "   "), true);
});

test("confirmation present without text → false (no entry to ask about)", () => {
  assert.equal(needsSuggestionPick("", "Москва, ул. Ленина, д. 5"), false);
});
