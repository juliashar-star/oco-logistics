import assert from "node:assert/strict";
import test from "node:test";

import {
  YandexAuthError,
  getOrderInfo,
} from "../packages/core/src/carrier-adapter/yandex/client.ts";

const TEST_BASE_URL = "https://b2b.taxi.tst.yandex.net";
const VALID_CREDS = {
  platformStationId: "fbed3aa1-2cc6-4370-ab4d-59c5cc9bb924",
  token: "test-token",
};
const REQUEST_ID = "12c55cfe6690434481c4b9ab7acb6bd3-udp";

/** Shape captured live 2026-07-24 from request/info (fields we map + scaffolding). */
const REAL_INFO_BODY = {
  route_id: null,
  request_id: REQUEST_ID,
  request: {
    info: {
      operator_request_id: "oco-f5fbdbdf03eb2a8f719f1983fe398370",
      referral_source: "logistic-platform-offers",
    },
    destination: {
      type: "custom_location",
      interval_utc: {
        from: "2026-07-27T06:00:00+0000",
        to: "2026-07-27T15:00:00+0000",
      },
    },
    billing_info: {
      payment_method: "already_paid",
      delivery_cost: 0,
    },
  },
  state: {
    status: "SORTING_CENTER_LOADED",
    description: "Создан в сортировочном центре",
  },
  sharing_url:
    "https://logistics-frontend.taxi.tst.yandex.ru/route/8cb514ec-89c3-486a-94cc-914f75eedaae",
  courier_order_id: "10014440",
};

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
      return typeof body === "string" ? body : JSON.stringify(body);
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

test("getOrderInfo happy path maps all four fields from real body shape", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() => jsonResponse(200, REAL_INFO_BODY));

    try {
      const result = await getOrderInfo(REQUEST_ID, VALID_CREDS);
      assert.deepEqual(result, {
        ok: true,
        info: {
          trackingNumber: "10014440",
          trackingUrl:
            "https://logistics-frontend.taxi.tst.yandex.ru/route/8cb514ec-89c3-486a-94cc-914f75eedaae",
          plannedDeliveryFrom: "2026-07-27T06:00:00+0000",
          plannedDeliveryTo: "2026-07-27T15:00:00+0000",
        },
      });
      assert.equal(mock.calls.length, 1);
      assert.equal(mock.calls[0].init.method, "GET");
      assert.equal(
        mock.calls[0].url,
        `${TEST_BASE_URL}/api/b2b/platform/request/info?request_id=${encodeURIComponent(REQUEST_ID)}`,
      );
      assert.equal(
        mock.calls[0].init.headers.Authorization,
        `Bearer ${VALID_CREDS.token}`,
      );
    } finally {
      mock.restore();
    }
  });
});

test("getOrderInfo sharing_url null → trackingUrl key absent", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(200, { ...REAL_INFO_BODY, sharing_url: null }),
    );

    try {
      const result = await getOrderInfo(REQUEST_ID, VALID_CREDS);
      assert.equal(result.ok, true);
      assert.equal("trackingUrl" in result.info, false);
      assert.equal(result.info.trackingNumber, "10014440");
    } finally {
      mock.restore();
    }
  });
});

test("getOrderInfo courier_order_id null → trackingNumber key absent", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(200, { ...REAL_INFO_BODY, courier_order_id: null }),
    );

    try {
      const result = await getOrderInfo(REQUEST_ID, VALID_CREDS);
      assert.equal(result.ok, true);
      assert.equal("trackingNumber" in result.info, false);
      assert.ok(result.info.trackingUrl);
    } finally {
      mock.restore();
    }
  });
});

test("getOrderInfo interval_utc missing → date fields omitted, still ok", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(200, {
        ...REAL_INFO_BODY,
        request: {
          ...REAL_INFO_BODY.request,
          destination: { type: "custom_location" },
        },
      }),
    );

    try {
      const result = await getOrderInfo(REQUEST_ID, VALID_CREDS);
      assert.equal(result.ok, true);
      assert.equal("plannedDeliveryFrom" in result.info, false);
      assert.equal("plannedDeliveryTo" in result.info, false);
      assert.equal(result.info.trackingNumber, "10014440");
    } finally {
      mock.restore();
    }
  });
});

test("getOrderInfo customer_order_not_found → order_not_found", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(404, {
        code: "customer_order_not_found",
        message: "not found",
      }),
    );

    try {
      const result = await getOrderInfo(REQUEST_ID, VALID_CREDS);
      assert.deepEqual(result, { ok: false, reason: "order_not_found" });
    } finally {
      mock.restore();
    }
  });
});

test("getOrderInfo HTTP 401 throws YandexAuthError", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() => jsonResponse(401, { message: "no" }));

    try {
      await assert.rejects(
        () => getOrderInfo(REQUEST_ID, VALID_CREDS),
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

test("getOrderInfo non-200 error never leaks the body into the message", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(500, {
        code: "internal_error",
        recipient_info: { phone: "+79099538888" },
      }),
    );

    try {
      await assert.rejects(
        () => getOrderInfo(REQUEST_ID, VALID_CREDS),
        (err) => {
          assert.ok(err instanceof Error);
          assert.equal(err.message.includes("79099538888"), false);
          assert.equal(err.message.includes("internal_error"), true);
          return true;
        },
      );
    } finally {
      mock.restore();
    }
  });
});

test("getOrderInfo non-object 200 body → throws malformed", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() => jsonResponse(200, ["not", "an", "object"]));

    try {
      await assert.rejects(
        () => getOrderInfo(REQUEST_ID, VALID_CREDS),
        /malformed response \(body is not an object\)/,
      );
    } finally {
      mock.restore();
    }
  });
});
