import assert from "node:assert/strict";
import test from "node:test";

import { isHttpOrHttpsUrl } from "../apps/web/lib/url/is-http-or-https-url.ts";

test("non-string → false", () => {
  assert.equal(isHttpOrHttpsUrl(null), false);
  assert.equal(isHttpOrHttpsUrl(undefined), false);
  assert.equal(isHttpOrHttpsUrl(1), false);
});

test("empty string → false", () => {
  assert.equal(isHttpOrHttpsUrl(""), false);
});

test("whitespace → false", () => {
  assert.equal(isHttpOrHttpsUrl("   "), false);
});

test("malformed → false", () => {
  assert.equal(isHttpOrHttpsUrl("not a url"), false);
});

test("http://example.com → true", () => {
  assert.equal(isHttpOrHttpsUrl("http://example.com"), true);
});

test("javascript:alert(1) → false", () => {
  assert.equal(isHttpOrHttpsUrl("javascript:alert(1)"), false);
});

test("data: URL → false", () => {
  assert.equal(isHttpOrHttpsUrl("data:text/html,hi"), false);
});

test("relative path → false", () => {
  assert.equal(isHttpOrHttpsUrl("/route/abc"), false);
});

test("https URL → true", () => {
  assert.equal(
    isHttpOrHttpsUrl("https://logistics-frontend.taxi.tst.yandex.ru/route/abc"),
    true,
  );
});
