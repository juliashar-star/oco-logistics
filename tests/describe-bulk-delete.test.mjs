import assert from "node:assert/strict";
import test from "node:test";

import {
  describeBulkDeleteConfirmation,
  describeBulkDeleteResult,
} from "../apps/web/lib/shipments/describe-bulk-delete.ts";

test("nothing is being kept → one sentence, no zero to explain", () => {
  assert.equal(describeBulkDeleteConfirmation(5, 0), "Удалить черновиков: 5.");
});

test("something is being kept → both numbers are named", () => {
  assert.equal(
    describeBulkDeleteConfirmation(5, 3),
    "Удалить черновиков: 5. Не будет удалено отправлений: 3.",
  );
});

test("one draft — the wording holds for the singular without agreeing with it", () => {
  assert.equal(describeBulkDeleteConfirmation(1, 0), "Удалить черновиков: 1.");
});

test("one draft and one kept row — both halves hold at 1", () => {
  assert.equal(
    describeBulkDeleteConfirmation(1, 1),
    "Удалить черновиков: 1. Не будет удалено отправлений: 1.",
  );
});

test("nothing to delete but something kept — still states both", () => {
  assert.equal(
    describeBulkDeleteConfirmation(0, 2),
    "Удалить черновиков: 0. Не будет удалено отправлений: 2.",
  );
});

test("a negative kept count cannot produce a second sentence", () => {
  assert.equal(describeBulkDeleteConfirmation(2, -1), "Удалить черновиков: 2.");
});

test("the result reports the server's count and nothing else", () => {
  assert.equal(describeBulkDeleteResult(4), "Удалено черновиков: 4.");
  assert.equal(describeBulkDeleteResult(1), "Удалено черновиков: 1.");
  assert.equal(describeBulkDeleteResult(0), "Удалено черновиков: 0.");
});
