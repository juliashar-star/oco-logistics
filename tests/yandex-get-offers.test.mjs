import assert from "node:assert/strict";
import test from "node:test";

import {
  YandexAuthError,
  getOffers,
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

/** Same request shape as createOrder's doomed body — offers/create reuses it. */
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

function makeRawOffer(index) {
  const deliveryDay = String(14 + index).padStart(2, "0");
  const pickupDay = String(13 + index).padStart(2, "0");
  return {
    offer_id: `offer-${index + 1}`,
    expires_at: "2026-07-13T12:15:00.000000Z",
    offer_details: {
      delivery_interval: {
        min: `2026-07-${deliveryDay}T06:00:00.000000Z`,
        max: `2026-07-${deliveryDay}T15:00:00.000000Z`,
        policy: "time_interval",
      },
      pickup_interval: {
        min: `2026-07-${pickupDay}T06:00:00.000000Z`,
        max: `2026-07-${pickupDay}T15:00:00.000000Z`,
      },
      pricing: "354.10 RUB",
      pricing_commission_on_delivery_payment: "0%",
      pricing_commission_on_delivery_payment_amount: "0 RUB",
      pricing_total: "374.54 RUB",
    },
  };
}

test("getOffers happy path: 11 offers map to CarrierOffer with pricing_total", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const rawOffers = Array.from({ length: 11 }, (_, i) => makeRawOffer(i));
    const mock = installFetchMock(() => jsonResponse(200, { offers: rawOffers }));

    try {
      const result = await getOffers(baseInput(), VALID_CREDS);

      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.offers.length, 11);
      assert.ok(result.offers.every((o) => o.offerId.length > 0));
      assert.equal(result.offers[0].offerId, "offer-1");
      assert.equal(result.offers[0].expiresAt, "2026-07-13T12:15:00.000000Z");
      assert.equal(result.offers[0].deliveryIntervalFrom, "2026-07-14T06:00:00.000000Z");
      assert.equal(result.offers[0].deliveryIntervalTo, "2026-07-14T15:00:00.000000Z");
      assert.equal(result.offers[0].pickupIntervalFrom, "2026-07-13T06:00:00.000000Z");
      assert.equal(result.offers[0].pickupIntervalTo, "2026-07-13T15:00:00.000000Z");
      assert.equal(result.offers[0].priceRub, 374.54);
      assert.deepEqual(result.offers[0].rawOffer, rawOffers[0]);
      assert.equal(result.offers[10].offerId, "offer-11");
      assert.equal(
        mock.calls[0].url,
        `${TEST_BASE_URL}/api/b2b/platform/offers/create`,
      );
    } finally {
      mock.restore();
    }
  });
});

test("getOffers request body matches offers/create expected shape", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(200, { offers: [makeRawOffer(0)] }),
    );

    try {
      await getOffers(baseInput(), VALID_CREDS);

      assert.deepEqual(mock.calls[0].body, EXPECTED_TWO_ITEM_BODY);
    } finally {
      mock.restore();
    }
  });
});

test("getOffers empty offers array returns { ok:true, offers:[] } without throw", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() => jsonResponse(200, { offers: [] }));

    try {
      const result = await getOffers(baseInput(), VALID_CREDS);
      assert.deepEqual(result, { ok: true, offers: [] });
    } finally {
      mock.restore();
    }
  });
});

test("getOffers 200 without offers key throws malformed", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() => jsonResponse(200, { request_id: "x" }));

    try {
      await assert.rejects(
        () => getOffers(baseInput(), VALID_CREDS),
        /malformed response \(offers missing or not an array\)/,
      );
    } finally {
      mock.restore();
    }
  });
});

test("getOffers cod.enabled throws YANDEX_COD_NOT_SUPPORTED and fetch is not called", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    let fetchCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error("fetch should not be called");
    };

    try {
      await assert.rejects(
        () => getOffers(baseInput({ cod: { enabled: true } }), VALID_CREDS),
        /YANDEX_COD_NOT_SUPPORTED/,
      );
      assert.equal(fetchCalled, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("getOffers markingCode throws YANDEX_MARKING_NOT_SUPPORTED and fetch is not called", async () => {
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
        () => getOffers(input, VALID_CREDS),
        /YANDEX_MARKING_NOT_SUPPORTED/,
      );
      assert.equal(fetchCalled, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("getOffers empty items throws YANDEX_NO_ITEMS and fetch is not called", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    let fetchCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error("fetch should not be called");
    };

    try {
      await assert.rejects(
        () => getOffers(baseInput({ items: [] }), VALID_CREDS),
        /YANDEX_NO_ITEMS/,
      );
      assert.equal(fetchCalled, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("getOffers no_delivery_options returns { ok:false, reason:\"no_delivery_options\" }", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const raw = { code: "no_delivery_options", message: "No delivery options available" };
    const mock = installFetchMock(() => jsonResponse(400, raw));

    try {
      const result = await getOffers(baseInput(), VALID_CREDS);
      assert.deepEqual(result, { ok: false, reason: "no_delivery_options" });
    } finally {
      mock.restore();
    }
  });
});

test("getOffers HTTP 400 without no_delivery_options code still throws", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const raw = { code: "some_other_error", message: "boom" };
    const mock = installFetchMock(() => jsonResponse(400, raw));

    try {
      await assert.rejects(
        () => getOffers(baseInput(), VALID_CREDS),
        (error) => {
          assert.match(error.message, /Yandex Delivery get offers failed: HTTP 400/);
          assert.match(error.message, /some_other_error/);
          return true;
        },
      );
    } finally {
      mock.restore();
    }
  });
});

test("getOffers HTTP 401 throws YandexAuthError", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(401, { code: "401", message: "Unauthorized" }),
    );

    try {
      await assert.rejects(
        () => getOffers(baseInput(), VALID_CREDS),
        (error) => error instanceof YandexAuthError,
      );
    } finally {
      mock.restore();
    }
  });
});

test("getOffers with pointOutId and no address uses platform_station + self_pickup", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(200, { offers: [makeRawOffer(0)] }),
    );

    try {
      const input = baseInput({
        pointOutId: "019c6bee642d770a937e0d33b27f6467",
        recipient: {
          ...RECIPIENT,
          addressString: undefined,
        },
      });
      await getOffers(input, VALID_CREDS);

      const body = mock.calls[0].body;
      assert.deepEqual(body.destination, {
        type: "platform_station",
        platform_station: { platform_id: "019c6bee642d770a937e0d33b27f6467" },
      });
      assert.equal(body.last_mile_policy, "self_pickup");
      assert.equal("custom_location" in body.destination, false);
    } finally {
      mock.restore();
    }
  });
});

test("getOffers with both pointOutId and address: pointOutId wins, no custom_location", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(200, { offers: [makeRawOffer(0)] }),
    );

    try {
      await getOffers(
        baseInput({ pointOutId: "019c6bee642d770a937e0d33b27f6467" }),
        VALID_CREDS,
      );

      const body = mock.calls[0].body;
      assert.deepEqual(body.destination, {
        type: "platform_station",
        platform_station: { platform_id: "019c6bee642d770a937e0d33b27f6467" },
      });
      assert.equal(body.last_mile_policy, "self_pickup");
      assert.equal(body.destination.type, "platform_station");
      assert.equal("custom_location" in body.destination, false);
    } finally {
      mock.restore();
    }
  });
});

test("getOffers courier with deliveryApartment + deliveryComment: details has room + comment; full_address unchanged", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(200, { offers: [makeRawOffer(0)] }),
    );

    try {
      await getOffers(
        baseInput({
          deliveryApartment: " 42 ",
          deliveryComment: " Домофон 42# ",
        }),
        VALID_CREDS,
      );

      const details = mock.calls[0].body.destination.custom_location.details;
      assert.equal(details.full_address, "Москва, ул. Тверская, д. 1");
      assert.equal(details.room, "42");
      assert.equal(details.comment, "Домофон 42#");
      assert.deepEqual(Object.keys(details).sort(), [
        "comment",
        "full_address",
        "room",
      ]);
    } finally {
      mock.restore();
    }
  });
});

test("getOffers courier without apartment/comment: details has ONLY full_address", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(200, { offers: [makeRawOffer(0)] }),
    );

    try {
      await getOffers(
        baseInput({
          deliveryApartment: "   ",
          deliveryComment: null,
        }),
        VALID_CREDS,
      );

      const details = mock.calls[0].body.destination.custom_location.details;
      assert.deepEqual(details, {
        full_address: "Москва, ул. Тверская, д. 1",
      });
      assert.equal("room" in details, false);
      assert.equal("comment" in details, false);
    } finally {
      mock.restore();
    }
  });
});

test("getOffers PVZ path unaffected when deliveryApartment/comment set (platform_station, no details)", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(200, { offers: [makeRawOffer(0)] }),
    );

    try {
      await getOffers(
        baseInput({
          pointOutId: "019c6bee642d770a937e0d33b27f6467",
          deliveryApartment: "42",
          deliveryComment: "ignore me",
          recipient: {
            ...RECIPIENT,
            addressString: undefined,
          },
        }),
        VALID_CREDS,
      );

      const body = mock.calls[0].body;
      assert.deepEqual(body.destination, {
        type: "platform_station",
        platform_station: { platform_id: "019c6bee642d770a937e0d33b27f6467" },
      });
      assert.equal(body.last_mile_policy, "self_pickup");
      assert.equal("custom_location" in body.destination, false);
    } finally {
      mock.restore();
    }
  });
});

test("getOffers with neither pointOutId nor address throws YANDEX_NO_DESTINATION", async () => {
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
          getOffers(
            baseInput({
              recipient: { ...RECIPIENT, addressString: undefined },
            }),
            VALID_CREDS,
          ),
        /YANDEX_NO_DESTINATION/,
      );
      assert.equal(fetchCalled, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
