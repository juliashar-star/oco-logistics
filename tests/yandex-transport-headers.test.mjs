import assert from "node:assert/strict";
import test from "node:test";

import { yandexPost } from "../packages/core/src/carrier-adapter/yandex/transport.ts";

const CREDS = { platformStationId: "station", token: "tok-abc" };
const BASE = "https://example.test";

test("yandexPost extraHeaders: Accept-Language passes; Authorization override does not", async () => {
  /** @type {HeadersInit | undefined} */
  let seenHeaders;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    seenHeaders = init?.headers;
    return new Response("{}", { status: 200 });
  };
  try {
    await yandexPost(BASE, CREDS, "/path", { a: 1 }, {
      "Accept-Language": "ru",
      Authorization: "Bearer attacker-override",
      "Content-Type": "text/plain",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(seenHeaders);
  const headers = new Headers(seenHeaders);
  assert.equal(headers.get("Accept-Language"), "ru");
  assert.equal(headers.get("Authorization"), "Bearer tok-abc");
  assert.equal(headers.get("Content-Type"), "application/json");
});
