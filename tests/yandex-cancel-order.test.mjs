import assert from "node:assert/strict";
import test from "node:test";

import {
  YandexAuthError,
  cancelOrder,
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
    const body =
      init?.body != null ? JSON.parse(init.body) : undefined;
    calls.push({ url, init, body });
    return handler({ url, init, body, calls });
  };
  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

// NEW FILE — all tests below are ADD.

test("cancelOrder 200 with real body maps accepted + CREATED + reason + description", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(200, {
        status: "CREATED",
        reason: "cancellation_started",
        description: "Заявка создана; заказ отменяется",
      }),
    );

    try {
      const result = await cancelOrder(REQUEST_ID, VALID_CREDS);
      assert.deepEqual(result, {
        ok: true,
        result: {
          accepted: true,
          providerStatus: "CREATED",
          reason: "cancellation_started",
          description: "Заявка создана; заказ отменяется",
        },
      });
      assert.equal(mock.calls.length, 1);
      assert.equal(mock.calls[0].init.method, "POST");
      assert.equal(
        mock.calls[0].url,
        `${TEST_BASE_URL}/api/b2b/platform/request/cancel`,
      );
      assert.deepEqual(mock.calls[0].body, { request_id: REQUEST_ID });
    } finally {
      mock.restore();
    }
  });
});

test("cancelOrder 200 without description omits it and still accepts", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(200, {
        status: "CREATED",
        reason: "cancellation_started",
      }),
    );

    try {
      const result = await cancelOrder(REQUEST_ID, VALID_CREDS);
      assert.deepEqual(result, {
        ok: true,
        result: {
          accepted: true,
          providerStatus: "CREATED",
          reason: "cancellation_started",
        },
      });
      assert.equal("description" in result.result, false);
    } finally {
      mock.restore();
    }
  });
});

test("cancelOrder 200 without reason omits it and still accepts", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(200, { status: "CREATED" }),
    );

    try {
      const result = await cancelOrder(REQUEST_ID, VALID_CREDS);
      assert.deepEqual(result, {
        ok: true,
        result: {
          accepted: true,
          providerStatus: "CREATED",
        },
      });
      assert.equal("reason" in result.result, false);
    } finally {
      mock.restore();
    }
  });
});

test("cancelOrder 200 without status throws malformed", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(200, { reason: "cancellation_started" }),
    );

    try {
      await assert.rejects(
        () => cancelOrder(REQUEST_ID, VALID_CREDS),
        /malformed response \(status missing or not a string\)/,
      );
    } finally {
      mock.restore();
    }
  });
});

test("cancelOrder customer_order_not_found → order_not_found", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(404, {
        code: "customer_order_not_found",
        message: "not found",
      }),
    );

    try {
      const result = await cancelOrder(REQUEST_ID, VALID_CREDS);
      assert.deepEqual(result, { ok: false, reason: "order_not_found" });
    } finally {
      mock.restore();
    }
  });
});

test("cancelOrder other non-200 throws", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(500, { code: "internal", message: "boom" }),
    );

    try {
      await assert.rejects(
        () => cancelOrder(REQUEST_ID, VALID_CREDS),
        /Yandex Delivery cancel order failed: HTTP 500/,
      );
    } finally {
      mock.restore();
    }
  });
});

test("cancelOrder HTTP 401 throws YandexAuthError", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() => jsonResponse(401, { message: "no" }));

    try {
      await assert.rejects(
        () => cancelOrder(REQUEST_ID, VALID_CREDS),
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
