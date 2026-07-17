import assert from "node:assert/strict";
import test from "node:test";

import {
  YandexAuthError,
  getOrderHistory,
} from "../packages/core/src/carrier-adapter/yandex/client.ts";

const TEST_BASE_URL = "https://b2b.taxi.tst.yandex.net";
const VALID_CREDS = {
  platformStationId: "fbed3aa1-2cc6-4370-ab4d-59c5cc9bb924",
  token: "test-token",
};
const REQUEST_ID = "227868d15da04c14bea5528825b62a5a-udp";

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
    calls.push({ url, init });
    return handler({ url, init, calls });
  };
  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

// NEW FILE — all tests below are ADD (no existing file to extend).

test("getOrderHistory one-entry history maps four fields", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const entry = {
      status: "CREATED",
      description: "Принят",
      timestamp: 1784310138,
      timestamp_utc: "2026-07-17T17:42:18.000000Z",
    };
    const mock = installFetchMock(() =>
      jsonResponse(200, { state_history: [entry] }),
    );

    try {
      const result = await getOrderHistory(REQUEST_ID, VALID_CREDS);

      assert.deepEqual(result, {
        ok: true,
        events: [
          {
            statusCode: "CREATED",
            statusText: "Принят",
            eventAt: "2026-07-17T17:42:18.000000Z",
            raw: entry,
          },
        ],
      });
      assert.equal(mock.calls.length, 1);
      assert.equal(mock.calls[0].init.method, "GET");
      assert.equal(
        mock.calls[0].url,
        `${TEST_BASE_URL}/api/b2b/platform/request/history?request_id=${encodeURIComponent(REQUEST_ID)}`,
      );
    } finally {
      mock.restore();
    }
  });
});

test("getOrderHistory empty state_history → ok true, events [], does not throw", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(200, { state_history: [] }),
    );

    try {
      const result = await getOrderHistory(REQUEST_ID, VALID_CREDS);
      assert.deepEqual(result, { ok: true, events: [] });
    } finally {
      mock.restore();
    }
  });
});

test("getOrderHistory customer_order_not_found → order_not_found", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(404, {
        code: "customer_order_not_found",
        message: "not found",
      }),
    );

    try {
      const result = await getOrderHistory(REQUEST_ID, VALID_CREDS);
      assert.deepEqual(result, { ok: false, reason: "order_not_found" });
    } finally {
      mock.restore();
    }
  });
});

test("getOrderHistory other non-200 throws", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(500, { code: "internal", message: "boom" }),
    );

    try {
      await assert.rejects(
        () => getOrderHistory(REQUEST_ID, VALID_CREDS),
        /Yandex Delivery get order history failed: HTTP 500/,
      );
    } finally {
      mock.restore();
    }
  });
});

test("getOrderHistory state_history missing throws malformed", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() => jsonResponse(200, {}));

    try {
      await assert.rejects(
        () => getOrderHistory(REQUEST_ID, VALID_CREDS),
        /malformed response \(state_history missing or not an array\)/,
      );
    } finally {
      mock.restore();
    }
  });
});

test("getOrderHistory HTTP 401 throws YandexAuthError", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() => jsonResponse(401, { message: "no" }));

    try {
      await assert.rejects(
        () => getOrderHistory(REQUEST_ID, VALID_CREDS),
        (err) => {
          assert.ok(err instanceof YandexAuthError);
          return true;
        },
      );
    } finally {
      mock.restore();
    }
  });
});
