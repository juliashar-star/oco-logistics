import assert from "node:assert/strict";
import test from "node:test";

import { deriveOperatorRequestId } from "../apps/web/lib/shipments/operator-request-id.ts";

const SHAPE = /^oco-[0-9a-f]{32}$/;

test("deriveOperatorRequestId is deterministic across calls", () => {
  const a = deriveOperatorRequestId("co-1", "key-1");
  const b = deriveOperatorRequestId("co-1", "key-1");
  const c = deriveOperatorRequestId("co-1", "key-1");
  assert.equal(a, b);
  assert.equal(b, c);
});

test("deriveOperatorRequestId changes when companyId or idempotencyKey changes", () => {
  const base = deriveOperatorRequestId("co-1", "key-1");
  assert.notEqual(base, deriveOperatorRequestId("co-2", "key-1"));
  assert.notEqual(base, deriveOperatorRequestId("co-1", "key-2"));
});

test("deriveOperatorRequestId colon separator prevents preimage ambiguity", () => {
  assert.notEqual(
    deriveOperatorRequestId("ab", "cd"),
    deriveOperatorRequestId("abc", "d"),
  );
});

test("deriveOperatorRequestId shape is oco- + 32 lowercase hex (36 chars)", () => {
  const id = deriveOperatorRequestId("co-shape", "key-shape");
  assert.match(id, SHAPE);
  assert.equal(id.length, 36);
});

test("deriveOperatorRequestId stable regression vector (formula lock)", () => {
  // Hard-coded so a formula change that would break Yandex dedupe for
  // in-flight orders fails this test loudly.
  assert.equal(
    deriveOperatorRequestId("company-fixed-1", "idem-key-fixed-1"),
    "oco-fb4c2e6951b52de26b1cb26e0001ce0f",
  );
});
