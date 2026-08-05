import assert from "node:assert/strict";
import test from "node:test";

import { cacheKey } from "../packages/core/src/carrier-adapter/cdek/transport.ts";

// The CDEK OAuth token cache is keyed by cacheKey(baseUrl, account, securePassword).
// These tests pin the key's identity behaviour: what must make two keys equal or
// distinct. They never assert the digest expression itself — only observable
// (in)equality and that the raw secret never leaks into the key string.

const BASE = "https://cdek-key.test";
const ACCOUNT = "acct-1";
const SECRET = "super-secret-password-xyz";

// ── PIN (records today's behaviour; passes against the unchanged 2-arg cacheKey,
// which ignores the third argument): baseUrl and account determine the key, and
// the key is deterministic.

test("cacheKey: identical inputs give the same key", () => {
  assert.equal(cacheKey(BASE, ACCOUNT, SECRET), cacheKey(BASE, ACCOUNT, SECRET));
});

test("cacheKey: a different account gives a different key", () => {
  assert.notEqual(
    cacheKey(BASE, "acct-1", SECRET),
    cacheKey(BASE, "acct-2", SECRET),
  );
});

test("cacheKey: a different baseUrl gives a different key", () => {
  assert.notEqual(
    cacheKey("https://cdek-key-a.test", ACCOUNT, SECRET),
    cacheKey("https://cdek-key-b.test", ACCOUNT, SECRET),
  );
});

test("cacheKey: the raw securePassword never appears in the key", () => {
  const key = cacheKey(BASE, ACCOUNT, SECRET);
  assert.ok(
    !key.includes(SECRET),
    "cache key must not embed the raw securePassword",
  );
});

// ── BEHAVIOUR the fix introduces: the secret is part of the key identity, so a
// rotated password on the same (baseUrl, account) can no longer be served the
// token minted from the old password. (Same baseUrl + account held fixed.)

test("cacheKey: same account, DIFFERENT securePassword → DIFFERENT key", () => {
  assert.notEqual(
    cacheKey(BASE, ACCOUNT, "old-password"),
    cacheKey(BASE, ACCOUNT, "new-password"),
  );
});

test("cacheKey: same account, SAME securePassword → SAME key", () => {
  assert.equal(
    cacheKey(BASE, ACCOUNT, "unchanged-password"),
    cacheKey(BASE, ACCOUNT, "unchanged-password"),
  );
});
