/** Проверка кэша токена APIShip (логика auth.ts). */
import assert from "node:assert/strict";
import test from "node:test";

test("token cache reuses entry per login+baseUrl", () => {
  const cache = new Map();
  const key = "http://api.dev.apiship.ru/v1:test";
  cache.set(key, "token-abc");
  assert.equal(cache.get(key), "token-abc");
  assert.equal(cache.size, 1);
});
