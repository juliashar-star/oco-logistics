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
      { weightG: 1000, lengthCm: 20, widthCm: 20, heightCm: 20, items: [ITEM_A] },
      { weightG: 1000, items: [ITEM_B, ITEM_C] },
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

/**
 * THE TWO POINTS MUST AGREE ON WHAT THEY REFUSE. Before 07.09.2026 the order
 * builder guarded input.items while the quote guarded the normalised list, so
 * an order carrying places and an empty items array was PRICED and then refused
 * at submit — the seller saw a price for a shipment that could never be created.
 */
test("items:[] with declared places: the quote accepts it, and so does the order builder", async () => {
  const input = multiPlaceInput({ items: [] });

  const body = buildCdekOrderBody(input, OFFER_136, CREDS_TYPE1);
  assert.equal(body.packages.length, 2);

  const captured = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = stubFetch(captured);
  try {
    await withCdekBaseUrl(() => getOffers(input, CREDS_TYPE1));
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.ok(captured.length > 0, "the quote must not refuse what the order accepts");
  assert.equal(captured[0].body.packages.length, 2);
});

/**
 * WORDING CHANGED 07.09.2026, and the two reference suites were edited with it —
 * one line each, in tests/cdek-build-order-body.test.mjs and
 * tests/cdek-get-offers.test.mjs. That was safe because a string assertion
 * defends the WORDING, not the behaviour: the behaviour is defended by the
 * deepEqual assertions against bodies measured on the carrier's sandbox, and
 * those were not touched. The wording changed deliberately — the condition is
 * now about places, not about items, because that is what both points check.
 */
test("no items and no places: BOTH points refuse, with the same message", async () => {
  const input = multiPlaceInput({ items: [], places: undefined });

  assert.throws(
    () => buildCdekOrderBody(input, OFFER_136, CREDS_TYPE1),
    (err) =>
      err instanceof Error &&
      err.message === "CDEK_INPUT_INVALID: at least one place is required",
  );

  const realFetch = globalThis.fetch;
  globalThis.fetch = stubFetch([]);
  try {
    await withCdekBaseUrl(() =>
      assert.rejects(
        () => getOffers(input, CREDS_TYPE1),
        (err) =>
          err instanceof Error &&
          err.message === "CDEK_INPUT_INVALID: at least one place is required",
      ),
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a place with no items is refused by BOTH points", async () => {
  const input = multiPlaceInput({
    places: [{ weightG: 1000, items: [] }],
  });

  assert.throws(
    () => buildCdekOrderBody(input, OFFER_136, CREDS_TYPE1),
    (err) => err instanceof Error && err.message.startsWith("ORDER_PLACE_EMPTY:"),
  );

  const realFetch = globalThis.fetch;
  globalThis.fetch = stubFetch([]);
  try {
    await withCdekBaseUrl(() =>
      assert.rejects(
        () => getOffers(input, CREDS_TYPE1),
        (err) => err instanceof Error && err.message.startsWith("ORDER_PLACE_EMPTY:"),
      ),
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("no places: two items both reach the order body, in one package", () => {
  const body = buildCdekOrderBody(
    multiPlaceInput({ items: [ITEM_A, ITEM_B], places: undefined }),
    OFFER_136,
    CREDS_TYPE1,
  );

  assert.equal(body.packages.length, 1);
  assert.deepEqual(
    body.packages[0].items.map((item) => item.name),
    ["Товар А", "Товар Б"],
  );
  assert.deepEqual(
    body.packages[0].items.map((item) => item.ware_key),
    ["ORDER-77-1", "ORDER-77-2"],
  );
  // 1000×1 + 600×1 = 1600 g, sides are the per-axis maximum.
  assert.equal(body.packages[0].weight, 1600);
  assert.equal(body.packages[0].length, 30);
  assert.equal(body.packages[0].width, 20);
  assert.equal(body.packages[0].height, 20);
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

test("quote INSURANCE counts QUANTITY: cost is per unit, so the total is Σ cost × amount", async () => {
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
  // INVERTED 07.09.2026. This assertion previously expected "1750" — the sum of
  // unitPriceRub with the quantity dropped — and that was a DEFECT pinned as
  // behaviour, not behaviour worth pinning. `cost` is «Объявленная стоимость
  // товара (за единицу товара…). С данного значения рассчитывается страховка»,
  // and `amount` is required beside it
  // (docs/research/cdek-declared-value-2026-08-13.md:20-23), so the order
  // declares Σ cost × amount and the quote must ask for the same figure.
  // 1000×1 + 500×1 + 250×2 = 2000.
  assert.deepEqual(withServices.body.services, [{ code: "INSURANCE", parameter: "2000" }]);
});
