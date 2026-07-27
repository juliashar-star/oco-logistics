import assert from "node:assert/strict";
import test from "node:test";

import { deriveClaimsRequestId } from "../packages/core/src/carrier-adapter/yandex/express-client.ts";

const SHAPE = /^oco-[0-9a-f]{32}$/;

test("deriveClaimsRequestId is stable for the same clientNumber+offerId pair", () => {
  const a = deriveClaimsRequestId("oco-client-1", "payload-aaa");
  const b = deriveClaimsRequestId("oco-client-1", "payload-aaa");
  const c = deriveClaimsRequestId("oco-client-1", "payload-aaa");
  assert.equal(a, b);
  assert.equal(b, c);
});

test("deriveClaimsRequestId differs when offerId differs", () => {
  const base = deriveClaimsRequestId("oco-client-1", "payload-aaa");
  assert.notEqual(base, deriveClaimsRequestId("oco-client-1", "payload-bbb"));
});

test("deriveClaimsRequestId length stays within documented 1–128", () => {
  const id = deriveClaimsRequestId("oco-client-1", "payload-aaa");
  assert.match(id, SHAPE);
  assert.ok(id.length >= 1);
  assert.ok(id.length <= 128);
  assert.equal(id.length, 36);
});
