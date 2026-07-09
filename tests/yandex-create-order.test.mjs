import assert from "node:assert/strict";
import test from "node:test";

import {
  YandexAuthError,
  createOrder,
} from "../packages/core/src/carrier-adapter/yandex/client.ts";

const TEST_BASE_URL = "https://b2b.taxi.tst.yandex.net";
const VALID_CREDS = {
  platformStationId: "fbed3aa1-2cc6-4370-ab4d-59c5cc9bb924",
  token: "test-token",
};

const RECIPIENT = {
  countryCode: "RU",
  contactName: "Иванов Иван",
  phone: "+79001234567",
  city: "Москва",
  addressString: "ул. Тверская, д. 1",
};

const SENDER = {
  countryCode: "RU",
  contactName: "OCO Test",
  phone: "+74950000000",
  city: "Москва",
  addressString: "ул. Примерная, 1",
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
      return JSON.stringify(body);
    },
  };
}

function installFetchMock(handler) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
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

function baseInput(overrides = {}) {
  return {
    clientNumber: "ORDER-42",
    providerKey: "yataxi",
    sender: SENDER,
    recipient: RECIPIENT,
    items: [
      {
        name: "Товар А",
        quantity: 2,
        unitPriceRub: 100,
        weightG: 500,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 10,
      },
      {
        name: "Товар Б",
        quantity: 1,
        unitPriceRub: 50,
        weightG: 300,
        lengthCm: 40,
        widthCm: 15,
        heightCm: 25,
      },
    ],
    ...overrides,
  };
}

const EXPECTED_TWO_ITEM_BODY = {
  info: { operator_request_id: "ORDER-42" },
  source: {
    platform_station: { platform_id: VALID_CREDS.platformStationId },
  },
  destination: {
    type: "custom_location",
    custom_location: {
      details: { full_address: "Москва, ул. Тверская, д. 1" },
    },
  },
  billing_info: { payment_method: "already_paid" },
  recipient_info: {
    first_name: "Иванов",
    last_name: "Иван",
    phone: "+79001234567",
  },
  last_mile_policy: "time_interval",
  items: [
    {
      count: 2,
      name: "Товар А",
      article: "Товар А",
      billing_details: { unit_price: 10000, assessed_unit_price: 10000 },
      physical_dims: { dx: 30, dy: 20, dz: 10 },
      place_barcode: "ORDER-42-1",
    },
    {
      count: 1,
      name: "Товар Б",
      article: "Товар Б",
      billing_details: { unit_price: 5000, assessed_unit_price: 5000 },
      physical_dims: { dx: 40, dy: 15, dz: 25 },
      place_barcode: "ORDER-42-1",
    },
  ],
  places: [
    {
      barcode: "ORDER-42-1",
      physical_dims: { weight_gross: 1300, dx: 40, dy: 20, dz: 25 },
    },
  ],
};

test("happy path: 200 returns orderId, isNewOrder true, full rawResponse", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const raw = { request_id: "abc123-udp" };
    const mock = installFetchMock(() => jsonResponse(200, raw));

    try {
      const result = await createOrder(baseInput(), VALID_CREDS);

      assert.equal(result.orderId, "abc123-udp");
      assert.equal(result.isNewOrder, true);
      assert.deepEqual(result.rawResponse, raw);
      assert.equal(mock.calls.length, 1);
      assert.equal(
        mock.calls[0].url,
        `${TEST_BASE_URL}/api/b2b/platform/request/create`,
      );
    } finally {
      mock.restore();
    }
  });
});

test("request body exactly matches expected shape for two-item order", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(200, { request_id: "abc123-udp" }),
    );

    try {
      await createOrder(baseInput(), VALID_CREDS);

      assert.deepEqual(mock.calls[0].body, EXPECTED_TWO_ITEM_BODY);
    } finally {
      mock.restore();
    }
  });
});

test("duplicate operator_request_id: 208 returns isNewOrder false without throw", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const raw = { request_id: "dup-id-udp" };
    const mock = installFetchMock(() => jsonResponse(208, raw));

    try {
      const result = await createOrder(baseInput(), VALID_CREDS);

      assert.equal(result.orderId, "dup-id-udp");
      assert.equal(result.isNewOrder, false);
      assert.deepEqual(result.rawResponse, raw);
    } finally {
      mock.restore();
    }
  });
});

test("cod.enabled throws YANDEX_COD_NOT_SUPPORTED and fetch is not called", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    let fetchCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error("fetch should not be called");
    };

    try {
      await assert.rejects(
        () => createOrder(baseInput({ cod: { enabled: true } }), VALID_CREDS),
        /YANDEX_COD_NOT_SUPPORTED/,
      );
      assert.equal(fetchCalled, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("markingCode throws YANDEX_MARKING_NOT_SUPPORTED and fetch is not called", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    let fetchCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error("fetch should not be called");
    };

    try {
      const input = baseInput();
      input.items[0].markingCode = { gtin: "04601234567890", serialNumber: "ABC" };

      await assert.rejects(
        () => createOrder(input, VALID_CREDS),
        /YANDEX_MARKING_NOT_SUPPORTED/,
      );
      assert.equal(fetchCalled, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("empty items throws YANDEX_NO_ITEMS and fetch is not called", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    let fetchCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error("fetch should not be called");
    };

    try {
      await assert.rejects(
        () => createOrder(baseInput({ items: [] }), VALID_CREDS),
        /YANDEX_NO_ITEMS/,
      );
      assert.equal(fetchCalled, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("recipient without addressString throws YANDEX_NO_ADDRESS", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    let fetchCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error("fetch should not be called");
    };

    try {
      const input = baseInput({
        recipient: {
          ...RECIPIENT,
          addressString: undefined,
        },
      });

      await assert.rejects(
        () => createOrder(input, VALID_CREDS),
        /YANDEX_NO_ADDRESS/,
      );
      assert.equal(fetchCalled, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("HTTP 401 throws YandexAuthError", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(401, { code: "401", message: "Unauthorized" }),
    );

    try {
      await assert.rejects(
        () => createOrder(baseInput(), VALID_CREDS),
        (error) => error instanceof YandexAuthError,
      );
    } finally {
      mock.restore();
    }
  });
});

test("HTTP 400 throws Error with status and raw body in message", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const raw = { code: "400", message: "Error at path 'items[0].article': Field is missing" };
    const mock = installFetchMock(() => jsonResponse(400, raw));

    try {
      await assert.rejects(
        () => createOrder(baseInput(), VALID_CREDS),
        (error) => {
          assert.match(error.message, /400/);
          assert.match(error.message, /items\[0\]\.article/);
          return true;
        },
      );
    } finally {
      mock.restore();
    }
  });
});

test('contactName without space maps to first_name and last_name "-"', async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(200, { request_id: "abc123-udp" }),
    );

    try {
      await createOrder(
        baseInput({
          recipient: { ...RECIPIENT, contactName: "Иван" },
        }),
        VALID_CREDS,
      );

      assert.equal(mock.calls[0].body.recipient_info.first_name, "Иван");
      assert.equal(mock.calls[0].body.recipient_info.last_name, "-");
    } finally {
      mock.restore();
    }
  });
});

test("unitPriceRub 19.99 maps to unit_price 1999 kopecks", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(200, { request_id: "abc123-udp" }),
    );

    try {
      await createOrder(
        baseInput({
          items: [
            {
              name: "Копеечный товар",
              quantity: 1,
              unitPriceRub: 19.99,
              weightG: 100,
            },
          ],
        }),
        VALID_CREDS,
      );

      assert.equal(mock.calls[0].body.items[0].billing_details.unit_price, 1999);
      assert.equal(mock.calls[0].body.items[0].billing_details.assessed_unit_price, 1999);
    } finally {
      mock.restore();
    }
  });
});
