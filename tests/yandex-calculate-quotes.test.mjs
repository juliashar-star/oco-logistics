import assert from "node:assert/strict";
import test from "node:test";

import {
  YandexAuthError,
  calculateQuotes,
} from "../packages/core/src/carrier-adapter/yandex/client.ts";

const TEST_BASE_URL = "https://b2b.taxi.tst.yandex.net";
const VALID_CREDS = {
  platformStationId: "fbed3aa1-2cc6-4370-ab4d-59c5cc9bb924",
  token: "test-token",
};

const BASE_INPUT = {
  from: { countryCode: "RU", city: "Москва" },
  to: { countryCode: "RU", city: "Москва", addressString: "Тверская улица, 7" },
  weightG: 1000,
  lengthCm: 20,
  widthCm: 20,
  heightCm: 20,
};

const PVZ_ID = "01946f4f013c7337874ec2fb848a58a4";

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
    calls.push({ url, init, body: JSON.parse(init.body) });
    return handler({ url, init, body: JSON.parse(init.body), calls });
  };
  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

test("both address and pointOutId present returns 2 quotes with correct mapping", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(({ body }) => {
      if (body.tariff === "time_interval") {
        return jsonResponse(200, { pricing_total: "374.54 RUB", delivery_days: 2 });
      }
      return jsonResponse(200, { pricing_total: "203.74 RUB", delivery_days: 3 });
    });

    try {
      const result = await calculateQuotes(
        { ...BASE_INPUT, pointOutId: PVZ_ID },
        VALID_CREDS,
      );

      assert.equal(result.ok, true);
      assert.equal(result.quotes.length, 2);

      const door = result.quotes.find((q) => q.deliveryMode === "door");
      const point = result.quotes.find((q) => q.deliveryMode === "point");

      assert.ok(door);
      assert.equal(door.tariffId, "time_interval");
      assert.equal(door.tariffName, "Курьером до двери");
      assert.equal(door.deliveryCostRub, 374.54);
      assert.equal(door.deliveryDaysMin, 2);
      assert.equal(door.deliveryDaysMax, 2);
      assert.equal(door.providerKey, "yataxi");

      assert.ok(point);
      assert.equal(point.tariffId, "self_pickup");
      assert.equal(point.tariffName, "Самовывоз из ПВЗ");
      assert.equal(point.deliveryCostRub, 203.74);
      assert.equal(point.deliveryDaysMin, 3);
      assert.equal(point.deliveryDaysMax, 3);
      assert.equal(point.providerKey, "yataxi");

      assert.equal(mock.calls.length, 2);
    } finally {
      mock.restore();
    }
  });
});

test("only address present returns exactly 1 door quote and one fetch call", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(({ body }) => {
      assert.equal(body.tariff, "time_interval");
      return jsonResponse(200, { pricing_total: "374.54 RUB", delivery_days: 2 });
    });

    try {
      const result = await calculateQuotes(BASE_INPUT, VALID_CREDS);

      assert.equal(result.ok, true);
      assert.equal(result.quotes.length, 1);
      assert.equal(result.quotes[0].deliveryMode, "door");
      assert.equal(result.quotes[0].tariffId, "time_interval");
      assert.equal(mock.calls.length, 1);
      assert.equal(mock.calls[0].body.tariff, "time_interval");
    } finally {
      mock.restore();
    }
  });
});

test("only pointOutId present returns exactly 1 point quote", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(({ body }) => {
      assert.equal(body.tariff, "self_pickup");
      assert.equal(body.destination.platform_station_id, PVZ_ID);
      return jsonResponse(200, { pricing_total: "203.74 RUB", delivery_days: 2 });
    });

    try {
      const result = await calculateQuotes(
        {
          ...BASE_INPUT,
          to: { countryCode: "RU", city: "Москва" },
          pointOutId: PVZ_ID,
        },
        VALID_CREDS,
      );

      assert.equal(result.ok, true);
      assert.equal(result.quotes.length, 1);
      assert.equal(result.quotes[0].deliveryMode, "point");
      assert.equal(result.quotes[0].tariffId, "self_pickup");
      assert.equal(mock.calls.length, 1);
    } finally {
      mock.restore();
    }
  });
});

test("HTTP 401 throws YandexAuthError and is not swallowed", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() => jsonResponse(401, { code: "401", message: "Unauthorized" }));

    try {
      await assert.rejects(
        () => calculateQuotes(BASE_INPUT, VALID_CREDS),
        (error) => error instanceof YandexAuthError,
      );
    } finally {
      mock.restore();
    }
  });
});

test("HTTP 500 on door call THROWS even while point call succeeds — carrier does not silently vanish", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(({ body }) => {
      if (body.tariff === "time_interval") {
        return jsonResponse(500, { code: "internal", message: "boom" });
      }
      return jsonResponse(200, { pricing_total: "203.74 RUB", delivery_days: 2 });
    });

    try {
      await assert.rejects(
        () => calculateQuotes({ ...BASE_INPUT, pointOutId: PVZ_ID }, VALID_CREDS),
        /Yandex Delivery calculate quote failed: HTTP 500/,
      );
    } finally {
      mock.restore();
    }
  });
});

test("one tariff 200, the other no_delivery_options → ok:true with the served quote only", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(({ body }) => {
      if (body.tariff === "time_interval") {
        return jsonResponse(400, {
          code: "no_delivery_options",
          message: "no courier service here",
        });
      }
      return jsonResponse(200, { pricing_total: "203.74 RUB", delivery_days: 2 });
    });

    try {
      const result = await calculateQuotes(
        { ...BASE_INPUT, pointOutId: PVZ_ID },
        VALID_CREDS,
      );

      assert.equal(result.ok, true);
      assert.equal(result.quotes.length, 1);
      assert.equal(result.quotes[0].deliveryMode, "point");
      assert.equal(result.quotes[0].tariffId, "self_pickup");
      assert.equal(result.quotes[0].deliveryCostRub, 203.74);
      assert.equal(mock.calls.length, 2);
    } finally {
      mock.restore();
    }
  });
});

test("both tariffs no_delivery_options → ok:false reason no_delivery_options", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(400, {
        code: "no_delivery_options",
        message: "nothing serves this destination",
      }),
    );

    try {
      const result = await calculateQuotes(
        { ...BASE_INPUT, pointOutId: PVZ_ID },
        VALID_CREDS,
      );

      assert.deepEqual(result, { ok: false, reason: "no_delivery_options" });
      assert.equal(mock.calls.length, 2);
    } finally {
      mock.restore();
    }
  });
});

test("single-tariff call whose one tariff 500s → throws (not an empty result)", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(500, { code: "internal", message: "boom" }),
    );

    try {
      await assert.rejects(
        () => calculateQuotes(BASE_INPUT, VALID_CREDS),
        /Yandex Delivery calculate quote failed: HTTP 500/,
      );
      assert.equal(mock.calls.length, 1);
    } finally {
      mock.restore();
    }
  });
});

test("missing token throws before fetch and fetch is never called", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    let fetchCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error("fetch should not be called");
    };

    try {
      await assert.rejects(
        () =>
          calculateQuotes(BASE_INPUT, {
            platformStationId: VALID_CREDS.platformStationId,
          }),
        /YANDEX_CREDENTIALS_INVALID/,
      );
      assert.equal(fetchCalled, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("rawVariant contains the full raw pricing-calculator response", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const raw = { pricing_total: "374.54 RUB", delivery_days: 2 };
    const mock = installFetchMock(() => jsonResponse(200, raw));

    try {
      const result = await calculateQuotes(BASE_INPUT, VALID_CREDS);

      assert.equal(result.ok, true);
      assert.deepEqual(result.quotes[0].rawVariant, raw);
    } finally {
      mock.restore();
    }
  });
});
