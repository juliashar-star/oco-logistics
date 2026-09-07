import assert from "node:assert/strict";
import test from "node:test";

import { buildCdekOrderBody } from "../packages/core/src/carrier-adapter/cdek/build-order-body.ts";
import { getOffers } from "../packages/core/src/carrier-adapter/cdek/client.ts";

/**
 * MULTI-PLACE BODIES — NOT MEASURED AGAINST THE SANDBOX. The one-place body has
 * a measured reference (tests/cdek-build-order-body.test.mjs); this one has not:
 * no probe has ever sent two packages to api.edu.cdek.ru. These tests pin what
 * OUR builder emits, which is a different claim from «CDEK accepts it».
 */

const CREDS_TYPE1 = {
  account: "acct-multi-place",
  securePassword: "cdek-secure-password-must-not-leak",
  contractType: "1",
};

const CREDS_TYPE2 = { ...CREDS_TYPE1, contractType: "2" };

const OFFER_136 = {
  offerId: "cdek:136",
  expiresAt: "",
  deliveryIntervalFrom: "",
  deliveryIntervalTo: "",
  pickupIntervalFrom: "",
  pickupIntervalTo: "",
  priceRub: 150,
  priceIsEstimate: true,
  serviceName: "Посылка склад-склад",
  rawOffer: { tariff_code: 136 },
};

const ITEM_A = { name: "Товар А", quantity: 1, unitPriceRub: 1000, weightG: 1000, lengthCm: 20, widthCm: 20, heightCm: 20 };
const ITEM_B = { name: "Товар Б", quantity: 1, unitPriceRub: 500, weightG: 600, lengthCm: 30, widthCm: 10, heightCm: 10 };
const ITEM_C = { name: "Товар В", quantity: 2, unitPriceRub: 250, weightG: 200 };

function multiPlaceInput(overrides = {}) {
  return {
    clientNumber: "ORDER-77",
    providerKey: "cdek",
    sender: { countryCode: "RU", contactName: "Seller", phone: "+74951234567", city: "Москва" },
    recipient: { countryCode: "RU", contactName: "Тест Тестов", phone: "+79000000000", city: "Москва" },
    items: [ITEM_A, ITEM_B, ITEM_C],
    places: [
      { number: 1, weightG: 1000, lengthCm: 20, widthCm: 20, heightCm: 20, items: [ITEM_A] },
      { number: 2, weightG: 1000, items: [ITEM_B, ITEM_C] },
    ],
    pointOutId: "MSK65",
    ...overrides,
  };
}

test("order body: two packages, numbers 1 and 2, ware_key runs across the order", () => {
  const body = buildCdekOrderBody(multiPlaceInput(), OFFER_136, CREDS_TYPE1);

  assert.deepEqual(body.packages, [
    {
      number: "1",
      weight: 1000,
      length: 20,
      width: 20,
      height: 20,
      items: [
        { name: "Товар А", ware_key: "ORDER-77-1", payment: { value: 0 }, cost: 1000, weight: 1000, amount: 1 },
      ],
    },
    {
      // No length/width/height: the seller declared none for this place.
      number: "2",
      weight: 1000,
      items: [
        { name: "Товар Б", ware_key: "ORDER-77-2", payment: { value: 0 }, cost: 500, weight: 600, amount: 1 },
        { name: "Товар В", ware_key: "ORDER-77-3", payment: { value: 0 }, cost: 250, weight: 200, amount: 2 },
      ],
    },
  ]);
});

test("order body: place without declared dimensions omits them entirely", () => {
  const body = buildCdekOrderBody(multiPlaceInput(), OFFER_136, CREDS_TYPE1);

  assert.equal("length" in body.packages[1], false);
  assert.equal("width" in body.packages[1], false);
  assert.equal("height" in body.packages[1], false);
});

test("order body: every ware_key in a multi-place order is distinct", () => {
  const body = buildCdekOrderBody(multiPlaceInput(), OFFER_136, CREDS_TYPE1);
  const keys = body.packages.flatMap((pkg) => pkg.items.map((item) => item.ware_key));

  assert.equal(keys.length, 3);
  assert.equal(new Set(keys).size, 3);
});

test("order body: the rest of the body is untouched by having two places", () => {
  const body = buildCdekOrderBody(multiPlaceInput(), OFFER_136, CREDS_TYPE1);

  assert.equal(body.number, "ORDER-77");
  assert.equal(body.tariff_code, 136);
  assert.equal(body.delivery_point, "MSK65");
  assert.equal("to_location" in body, false);
  assert.deepEqual(body.from_location, { city: "Москва", address: "Москва" });
});

const BASE_URL = "https://cdek-multi-place.test";

/** Same shape as tests/cdek-get-offers.test.mjs — the adapter reads the env at call time. */
async function withCdekBaseUrl(run) {
  const saved = process.env.CDEK_BASE_URL;
  process.env.CDEK_BASE_URL = BASE_URL;
  try {
    return await run();
  } finally {
    if (saved === undefined) {
      delete process.env.CDEK_BASE_URL;
    } else {
      process.env.CDEK_BASE_URL = saved;
    }
  }
}

/** Minimal calculator stub: OAuth, then tarifflist and tariffAndService. */
function stubFetch(captured) {
  return async (url, init) => {
    const href = String(url);
    if (href.includes("/v2/oauth/token")) {
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
    }
    captured.push({ href, body: JSON.parse(String(init.body)) });
    if (href.includes("tariffAndService")) {
      return new Response(JSON.stringify({ tariff_codes: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({ tariff_codes: [] }), { status: 200 });
  };
}

test("quote body: one package per place, and NO number field on any of them", async () => {
  const captured = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = stubFetch(captured);
  try {
    await withCdekBaseUrl(() => getOffers(multiPlaceInput(), CREDS_TYPE1));
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.ok(captured.length > 0, "expected at least one calculator call");
  for (const call of captured) {
    assert.deepEqual(call.body.packages, [
      { weight: 1000, length: 20, width: 20, height: 20 },
      { weight: 1000 },
    ]);
    for (const pkg of call.body.packages) {
      assert.equal("number" in pkg, false, "calculator packages carry no number");
    }
  }
});

test("quote INSURANCE on type 2 is the sum over ALL items, not the first line", async () => {
  const captured = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = stubFetch(captured);
  try {
    await withCdekBaseUrl(() => getOffers(multiPlaceInput(), CREDS_TYPE2));
  } finally {
    globalThis.fetch = realFetch;
  }

  const withServices = captured.find((call) => call.body.services !== undefined);
  assert.ok(withServices, "expected a body carrying services on contract type 2");
  // 1000 + 500 + 250 = 1750 — the order's declared value, per Регламент п. 8.2.
  assert.deepEqual(withServices.body.services, [{ code: "INSURANCE", parameter: "1750" }]);
});
