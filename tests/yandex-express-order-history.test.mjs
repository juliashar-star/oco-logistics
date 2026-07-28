import assert from "node:assert/strict";
import test from "node:test";

import {
  getExpressOrderHistory,
  getExpressOrderInfo,
} from "../packages/core/src/carrier-adapter/yandex/express-client.ts";

const TEST_BASE_URL = "https://b2b.taxi.tst.yandex.net";
const VALID_CREDS = {
  platformStationId: "fbed3aa1-2cc6-4370-ab4d-59c5cc9bb924",
  token: "test-token",
};
const CLAIM_ID = "claim-id-32chars-abcdefghijklmnop";

function setEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

async function withEnv(name, value, run) {
  const saved = process.env[name];
  setEnv(name, value);
  try {
    return await run();
  } finally {
    setEnv(name, saved);
  }
}

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

function installFetchMock(handler) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body =
      init && typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    const headers = init?.headers ?? {};
    calls.push({ url: String(url), init, body, headers });
    return handler(String(url), init, body, headers);
  };
  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

test("getExpressOrderHistory pickuped → one event with label and last_status_change_ts", async () => {
  await withEnv("YANDEX_EXPRESS_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(200, {
        status: "pickuped",
        last_status_change_ts: "2026-07-17T12:34:56+00:00",
        updated_ts: "2026-07-17T11:00:00+00:00",
      }),
    );
    try {
      const result = await getExpressOrderHistory(CLAIM_ID, VALID_CREDS);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.events.length, 1);
      assert.equal(result.events[0].statusCode, "pickuped");
      assert.equal(result.events[0].statusText, "Посылка у курьера");
      assert.equal(result.events[0].eventAt, "2026-07-17T12:34:56+00:00");
      assert.equal(mock.calls.length, 1);
      assert.match(String(mock.calls[0].url), /\/claims\/info\?claim_id=/);
      assert.equal(
        new Headers(mock.calls[0].init.headers).get("Accept-Language"),
        "ru",
      );
    } finally {
      mock.restore();
    }
  });
});

test("getExpressOrderHistory falls back to updated_ts when last_status_change_ts absent", async () => {
  await withEnv("YANDEX_EXPRESS_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(200, {
        status: "pickuped",
        updated_ts: "2026-07-17T11:00:00+00:00",
      }),
    );
    try {
      const result = await getExpressOrderHistory(CLAIM_ID, VALID_CREDS);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.events[0].eventAt, "2026-07-17T11:00:00+00:00");
    } finally {
      mock.restore();
    }
  });
});

test("getExpressOrderHistory non-200 → order_not_found", async () => {
  await withEnv("YANDEX_EXPRESS_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(404, { code: "not_found", message: "Claim not found" }),
    );
    try {
      const result = await getExpressOrderHistory(CLAIM_ID, VALID_CREDS);
      assert.deepEqual(result, { ok: false, reason: "order_not_found" });
    } finally {
      mock.restore();
    }
  });
});

test("getExpressOrderInfo makes ZERO fetch calls and returns empty ok info", async () => {
  await withEnv("YANDEX_EXPRESS_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() => {
      throw new Error("fetch must not be called");
    });
    try {
      const result = await getExpressOrderInfo(CLAIM_ID, VALID_CREDS);
      assert.deepEqual(result, { ok: true, info: {} });
      assert.equal(mock.calls.length, 0);
    } finally {
      mock.restore();
    }
  });
});
