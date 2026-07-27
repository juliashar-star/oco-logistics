import assert from "node:assert/strict";
import test from "node:test";

import { getExpressOffers } from "../packages/core/src/carrier-adapter/yandex/express-client.ts";

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
  addressString: "ул Тверская, д 1",
};

const SENDER = {
  countryCode: "RU",
  contactName: "OCO Test Warehouse",
  phone: "+74950000000",
  city: "Москва",
  addressString: "ул Складская, 1",
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
        name: "Посылка",
        quantity: 1,
        unitPriceRub: 100,
        weightG: 1000,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 10,
      },
    ],
    ...overrides,
  };
}

/** Proven by live probe: POST /b2b/cargo/integration/v2/offers/calculate. */
const EXPECTED_CALCULATE_BODY = {
  items: [
    {
      quantity: 1,
      size: { length: 0.3, width: 0.2, height: 0.1 },
      weight: 1,
      pickup_point: 1,
      dropoff_point: 2,
    },
  ],
  route_points: [
    { id: 1, fullname: "Москва, ул Складская, 1" },
    { id: 2, fullname: "Москва, ул Тверская, д 1" },
  ],
  requirements: { taxi_classes: ["express"] },
};

function makeRawExpressOffer(index) {
  return {
    price: {
      total_price: String(400 + index * 10),
      total_price_with_vat: String(488 + index * 12.2),
      base_price: String(400 + index * 10),
      surge_ratio: 1,
      currency: "RUB",
    },
    taxi_class: "express",
    pickup_interval: {
      from: "2026-07-27T07:34:49.856609+00:00",
      to: `2026-07-27T08:${String(10 + index).padStart(2, "0")}:00+00:00`,
    },
    delivery_interval: {
      from: "2026-07-27T07:34:49.856609+00:00",
      to: `2026-07-27T09:${String(10 + index).padStart(2, "0")}:00+00:00`,
    },
    description: `express_option_${index + 1}`,
    payload: `offer-payload-redis/v1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/${index + 1}`,
    offer_ttl: "2026-07-27T07:44:49.856609+00:00",
  };
}

test("getExpressOffers request body matches offers/calculate expected shape", async () => {
  await withEnv("YANDEX_EXPRESS_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(200, { offers: [makeRawExpressOffer(0)] }),
    );

    try {
      await getExpressOffers(baseInput(), VALID_CREDS);

      assert.deepEqual(mock.calls[0].body, EXPECTED_CALCULATE_BODY);
      assert.equal(
        mock.calls[0].url,
        `${TEST_BASE_URL}/b2b/cargo/integration/v2/offers/calculate`,
      );
    } finally {
      mock.restore();
    }
  });
});

test("getExpressOffers maps five offers using gross total_price_with_vat", async () => {
  await withEnv("YANDEX_EXPRESS_BASE_URL", TEST_BASE_URL, async () => {
    const rawOffers = Array.from({ length: 5 }, (_, i) => makeRawExpressOffer(i));
    const mock = installFetchMock(() => jsonResponse(200, { offers: rawOffers }));

    try {
      const result = await getExpressOffers(baseInput(), VALID_CREDS);

      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.offers.length, 5);
      assert.equal(
        result.offers[0].offerId,
        "offer-payload-redis/v1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1",
      );
      assert.equal(result.offers[0].expiresAt, "2026-07-27T07:44:49.856609+00:00");
      assert.equal(
        result.offers[0].deliveryIntervalFrom,
        "2026-07-27T07:34:49.856609+00:00",
      );
      assert.equal(result.offers[0].deliveryIntervalTo, "2026-07-27T09:10:00+00:00");
      assert.equal(
        result.offers[0].pickupIntervalFrom,
        "2026-07-27T07:34:49.856609+00:00",
      );
      assert.equal(result.offers[0].pickupIntervalTo, "2026-07-27T08:10:00+00:00");
      assert.equal(result.offers[0].priceRub, 488);
      assert.deepEqual(result.offers[0].rawOffer, rawOffers[0]);
      assert.equal(result.offers[4].priceRub, 488 + 4 * 12.2);
      assert.equal(
        result.offers[4].offerId,
        "offer-payload-redis/v1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/5",
      );
    } finally {
      mock.restore();
    }
  });
});

test("getExpressOffers PVZ input returns no_delivery_options with zero fetch calls", async () => {
  await withEnv("YANDEX_EXPRESS_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() => {
      throw new Error("fetch must not be called for PVZ short-circuit");
    });

    try {
      const result = await getExpressOffers(
        baseInput({ pointOutId: "pvz-station-uuid" }),
        VALID_CREDS,
      );

      assert.deepEqual(result, { ok: false, reason: "no_delivery_options" });
      assert.equal(mock.calls.length, 0);
    } finally {
      mock.restore();
    }
  });
});

test("getExpressOffers zone code returns no_delivery_options", async () => {
  await withEnv("YANDEX_EXPRESS_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(400, {
        code: "estimating.zone_unavailable",
        message: "zone unavailable",
      }),
    );

    try {
      const result = await getExpressOffers(baseInput(), VALID_CREDS);
      assert.deepEqual(result, { ok: false, reason: "no_delivery_options" });
    } finally {
      mock.restore();
    }
  });
});

test("getExpressOffers empty offers array returns no_delivery_options", async () => {
  await withEnv("YANDEX_EXPRESS_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() => jsonResponse(200, { offers: [] }));

    try {
      const result = await getExpressOffers(baseInput(), VALID_CREDS);
      assert.deepEqual(result, { ok: false, reason: "no_delivery_options" });
    } finally {
      mock.restore();
    }
  });
});

test("getExpressOffers non-200 throws", async () => {
  await withEnv("YANDEX_EXPRESS_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(500, { code: "internal_error", message: "boom" }),
    );

    try {
      await assert.rejects(
        () => getExpressOffers(baseInput(), VALID_CREDS),
        /Yandex Express get offers failed: HTTP 500/,
      );
    } finally {
      mock.restore();
    }
  });
});

test("getExpressOffers serialised body contains neither recipient name nor phone", async () => {
  await withEnv("YANDEX_EXPRESS_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(200, { offers: [makeRawExpressOffer(0)] }),
    );

    try {
      await getExpressOffers(baseInput(), VALID_CREDS);

      const serialised = JSON.stringify(mock.calls[0].body);
      assert.equal(serialised.includes(RECIPIENT.contactName), false);
      assert.equal(serialised.includes(RECIPIENT.phone), false);
      assert.equal(serialised.includes("Иванов"), false);
      assert.equal(serialised.includes("79001234567"), false);
    } finally {
      mock.restore();
    }
  });
});

test("getExpressOffers skips an offer without payload and keeps the valid one", async () => {
  await withEnv("YANDEX_EXPRESS_BASE_URL", TEST_BASE_URL, async () => {
    const valid = makeRawExpressOffer(0);
    const withoutPayload = { ...makeRawExpressOffer(1) };
    delete withoutPayload.payload;
    const mock = installFetchMock(() =>
      jsonResponse(200, { offers: [withoutPayload, valid] }),
    );

    try {
      const result = await getExpressOffers(baseInput(), VALID_CREDS);

      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.offers.length, 1);
      assert.equal(result.offers[0].offerId, valid.payload);
      assert.deepEqual(result.offers[0].rawOffer, valid);
    } finally {
      mock.restore();
    }
  });
});

test("getExpressOffers throws when offer price has no total_price_with_vat", async () => {
  await withEnv("YANDEX_EXPRESS_BASE_URL", TEST_BASE_URL, async () => {
    const broken = makeRawExpressOffer(0);
    delete broken.price.total_price_with_vat;
    const mock = installFetchMock(() => jsonResponse(200, { offers: [broken] }));

    try {
      await assert.rejects(
        () => getExpressOffers(baseInput(), VALID_CREDS),
        /Yandex Express offer missing price.total_price_with_vat/,
      );
    } finally {
      mock.restore();
    }
  });
});
