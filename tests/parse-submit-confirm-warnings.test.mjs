import assert from "node:assert/strict";
import test from "node:test";

import { parseSubmitConfirmWarnings } from "../apps/web/lib/shipments/parse-submit-confirm-warnings.ts";

test("absent or non-array warnings → empty", () => {
  assert.deepEqual(parseSubmitConfirmWarnings({}), []);
  assert.deepEqual(parseSubmitConfirmWarnings({ warnings: null }), []);
  assert.deepEqual(parseSubmitConfirmWarnings({ warnings: "x" }), []);
  assert.deepEqual(parseSubmitConfirmWarnings(null), []);
});

test("keeps only known neutral codes", () => {
  assert.deepEqual(
    parseSubmitConfirmWarnings({
      warnings: [
        "ADDRESS_NOT_FOUND",
        "not_a_real_code",
        "REQUIREMENT_UNMET",
        1,
        null,
      ],
    }),
    ["ADDRESS_NOT_FOUND", "REQUIREMENT_UNMET"],
  );
});
