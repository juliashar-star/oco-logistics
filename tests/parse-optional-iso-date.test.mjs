import assert from "node:assert/strict";
import { test } from "node:test";

import { parseOptionalIsoDate } from "../apps/web/lib/date/parse-optional-iso-date.ts";

test("empty string → null", () => {
  assert.equal(parseOptionalIsoDate(""), null);
});

test("whitespace → null", () => {
  assert.equal(parseOptionalIsoDate("   "), null);
});

test("malformed → null", () => {
  assert.equal(parseOptionalIsoDate("not-a-date"), null);
});

test("valid ISO → Date", () => {
  const iso = "2026-07-14T14:00:00+03:00";
  const parsed = parseOptionalIsoDate(iso);
  assert.ok(parsed instanceof Date);
  assert.equal(parsed.toISOString(), new Date(iso).toISOString());
});
