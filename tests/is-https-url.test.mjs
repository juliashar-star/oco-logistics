import assert from "node:assert/strict";
import test from "node:test";

import { isHttpsUrl } from "../apps/web/lib/url/is-https-url.ts";

test("non-string → false", () => {
  assert.equal(isHttpsUrl(null), false);
  assert.equal(isHttpsUrl(undefined), false);
  assert.equal(isHttpsUrl(1), false);
});

test("empty string → false", () => {
  assert.equal(isHttpsUrl(""), false);
});

test("whitespace → false", () => {
  assert.equal(isHttpsUrl("   "), false);
});

test("malformed → false", () => {
  assert.equal(isHttpsUrl("not a url"), false);
});

test("http://example.com → false", () => {
  assert.equal(isHttpsUrl("http://example.com"), false);
});

test("javascript:alert(1) → false", () => {
  assert.equal(isHttpsUrl("javascript:alert(1)"), false);
});

test("data: URL → false", () => {
  assert.equal(isHttpsUrl("data:text/html,hi"), false);
});

test("relative path → false", () => {
  assert.equal(isHttpsUrl("/route/abc"), false);
});

test("https URL → true", () => {
  assert.equal(
    isHttpsUrl("https://logistics-frontend.taxi.tst.yandex.ru/route/abc"),
    true,
  );
});
