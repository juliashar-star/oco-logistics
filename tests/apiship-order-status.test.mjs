/**
 * First HTTP-method tests for ApishipClient: getOrderStatusByClientNumber.
 * Stubs global fetch; login is required before the status call.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { clearApishipTokenCache } from "../packages/integrations/apiship/src/auth.ts";
import { createApishipClient } from "../packages/integrations/apiship/src/client.ts";
import { ApishipError } from "../packages/integrations/apiship/src/types.ts";

const BASE_URL = "http://api.dev.apiship.ru/v1";
const CONFIG = {
  baseUrl: BASE_URL,
  login: "test",
  password: "test",
};

const CLIENT_NUMBER = "oco-status-test-1";

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
  globalThis.fetch = async (url, init = {}) => {
    const urlStr = String(url);
    let body = null;
    if (init.body) {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const call = { url: urlStr, init, body };
    calls.push(call);
    return handler(call);
  };
  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

function withClient(run) {
  return async () => {
    clearApishipTokenCache();
    const mock = installFetchMock((call) => {
      if (call.url.endsWith("/users/login") && call.init.method === "POST") {
        return jsonResponse(200, { token: "test-token" });
      }
      return run.onStatus(call);
    });
    try {
      const client = createApishipClient(CONFIG);
      await run.test(client, mock);
    } finally {
      mock.restore();
      clearApishipTokenCache();
    }
  };
}

const ORDER_INFO = {
  orderId: "68944",
  providerKey: "cdek",
  providerNumber: "10292782816",
  additionalProviderNumber: "3af72599-0422-492c-9f17-0191720a1300",
  barcode: "",
  clientNumber: CLIENT_NUMBER,
  returnProviderNumber: "",
  trackingUrl: "https://www.cdek.ru/ru/tracking/?order_id=10292782816",
};

test(
  "docs shape { orderInfo, statuses[] } → OrderInfoResult",
  withClient({
    onStatus(call) {
      assert.match(call.url, /\/orders\/status\?/);
      assert.match(call.url, new RegExp(`clientNumber=${encodeURIComponent(CLIENT_NUMBER)}`));
      return jsonResponse(200, {
        orderInfo: ORDER_INFO,
        statuses: [
          { key: "uploaded", name: "Информация успешно загружена в систему перевозчика" },
          { key: "uploading", name: "Загрузка информации в систему перевозчика" },
        ],
      });
    },
    async test(client) {
      const result = await client.getOrderStatusByClientNumber(CLIENT_NUMBER);
      assert.ok(result);
      assert.equal(result.orderId, "68944");
      assert.equal(result.providerNumber, "10292782816");
      assert.equal(
        result.additionalProviderNumber,
        "3af72599-0422-492c-9f17-0191720a1300",
      );
    },
  }),
);

test(
  "sandbox shape { orderInfo, status } → same mapping; status field ignored",
  withClient({
    onStatus() {
      return jsonResponse(200, {
        orderInfo: ORDER_INFO,
        status: {
          key: "uploaded",
          name: "Информация успешно загружена в систему перевозчика",
          providerCode: "CREATED",
        },
      });
    },
    async test(client) {
      const result = await client.getOrderStatusByClientNumber(CLIENT_NUMBER);
      assert.ok(result);
      assert.equal(result.orderId, "68944");
      assert.equal(result.providerNumber, "10292782816");
      assert.equal(
        result.additionalProviderNumber,
        "3af72599-0422-492c-9f17-0191720a1300",
      );
    },
  }),
);

test(
  "empty providerNumber string → null",
  withClient({
    onStatus() {
      return jsonResponse(200, {
        orderInfo: {
          ...ORDER_INFO,
          providerNumber: "",
          additionalProviderNumber: "",
        },
        status: { key: "uploaded" },
      });
    },
    async test(client) {
      const result = await client.getOrderStatusByClientNumber(CLIENT_NUMBER);
      assert.ok(result);
      assert.equal(result.providerNumber, null);
      assert.equal(result.additionalProviderNumber, null);
    },
  }),
);

test(
  "additionalProviderNumber present, providerNumber absent → mapped",
  withClient({
    onStatus() {
      return jsonResponse(200, {
        orderInfo: {
          orderId: "68944",
          additionalProviderNumber: "extra-track-99",
        },
        statuses: [],
      });
    },
    async test(client) {
      const result = await client.getOrderStatusByClientNumber(CLIENT_NUMBER);
      assert.ok(result);
      assert.equal(result.providerNumber, null);
      assert.equal(result.additionalProviderNumber, "extra-track-99");
      assert.equal(result.orderId, "68944");
    },
  }),
);

test(
  "orderInfo.orderId absent → falls back to clientNumber",
  withClient({
    onStatus() {
      return jsonResponse(200, {
        orderInfo: {
          providerNumber: "TRACK-1",
        },
        status: {},
      });
    },
    async test(client) {
      const result = await client.getOrderStatusByClientNumber(CLIENT_NUMBER);
      assert.ok(result);
      assert.equal(result.orderId, CLIENT_NUMBER);
      assert.equal(result.providerNumber, "TRACK-1");
    },
  }),
);

test(
  "{} → throws ApishipError with raw body in message (not null)",
  withClient({
    onStatus() {
      return jsonResponse(200, {});
    },
    async test(client) {
      await assert.rejects(
        () => client.getOrderStatusByClientNumber(CLIENT_NUMBER),
        (err) => {
          assert.ok(err instanceof ApishipError);
          assert.match(err.message, /нераспознанная форма ответа/);
          assert.match(err.message, /\{\}/);
          return true;
        },
      );
    },
  }),
);

test(
  "legacy rows[] shape → throws ApishipError (not silent null)",
  withClient({
    onStatus() {
      return jsonResponse(200, {
        rows: [
          {
            orderId: "999",
            providerNumber: "SHOULD-NOT-BE-READ",
          },
        ],
      });
    },
    async test(client) {
      await assert.rejects(
        () => client.getOrderStatusByClientNumber(CLIENT_NUMBER),
        (err) => {
          assert.ok(err instanceof ApishipError);
          assert.match(err.message, /нераспознанная форма ответа/);
          assert.match(err.message, /SHOULD-NOT-BE-READ/);
          assert.match(err.message, /"rows"/);
          return true;
        },
      );
    },
  }),
);

test(
  "rawResponse preserves full raw object including status/statuses",
  withClient({
    onStatus() {
      return jsonResponse(200, {
        orderInfo: ORDER_INFO,
        status: { key: "uploaded", name: "ok" },
        statuses: [{ key: "uploading" }],
      });
    },
    async test(client) {
      const result = await client.getOrderStatusByClientNumber(CLIENT_NUMBER);
      assert.ok(result);
      assert.deepEqual(result.rawResponse, {
        orderInfo: ORDER_INFO,
        status: { key: "uploaded", name: "ok" },
        statuses: [{ key: "uploading" }],
      });
    },
  }),
);
