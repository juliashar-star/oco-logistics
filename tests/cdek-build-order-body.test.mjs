import assert from "node:assert/strict";
import test from "node:test";

import { buildCdekOrderBody } from "../packages/core/src/carrier-adapter/cdek/build-order-body.ts";

const CREDS_TYPE1 = {
  account: "acct-build-order",
  securePassword: "cdek-secure-password-must-not-leak",
  contractType: "1",
};

const CREDS_TYPE2 = {
  ...CREDS_TYPE1,
  contractType: "2",
};

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

const ITEM = {
  name: "Тестовая посылка",
  quantity: 1,
  unitPriceRub: 1000,
  weightG: 1000,
  lengthCm: 20,
  widthCm: 20,
  heightCm: 20,
};

function baseInput(overrides = {}) {
  return {
    clientNumber: "probe-1785847326011-sender",
    providerKey: "cdek",
    sender: {
      countryCode: "RU",
      contactName: "Seller",
      phone: "+74951234567",
      city: "Москва",
      // Fallback path: no street → address equals city (getOffers shape).
    },
    recipient: {
      countryCode: "RU",
      contactName: "Тест Тестов",
      phone: "+79000000000",
      city: "Москва",
    },
    items: [ITEM],
    ...overrides,
  };
}

/**
 * Measured SUCCESSFUL sandbox body (C3 from_location probe): type 1, tariff 136,
 * one package with one item, delivery_point, from_location — no shipment_point.
 * ware_key is synthesised as `${clientNumber}-1` by the builder.
 */
const MEASURED_SUCCESSFUL_PVZ_BODY = {
  type: 1,
  number: "probe-1785847326011-sender",
  tariff_code: 136,
  recipient: {
    name: "Тест Тестов",
    phones: [{ number: "+79000000000" }],
  },
  packages: [
    {
      number: "1",
      weight: 1000,
      length: 20,
      width: 20,
      height: 20,
      items: [
        {
          name: "Тестовая посылка",
          ware_key: "probe-1785847326011-sender-1",
          payment: { value: 0 },
          cost: 1000,
          weight: 1000,
          amount: 1,
        },
      ],
    },
  ],
  from_location: { city: "Москва", address: "Москва" },
  delivery_point: "MSK65",
};

test("PVZ order body deep-equals measured SUCCESSFUL sandbox shape", () => {
  const body = buildCdekOrderBody(
    baseInput({ pointOutId: "MSK65" }),
    OFFER_136,
    CREDS_TYPE1,
  );
  assert.deepEqual(body, MEASURED_SUCCESSFUL_PVZ_BODY);
});

test("door order emits to_location and no delivery_point", () => {
  const body = buildCdekOrderBody(
    baseInput({
      recipient: {
        countryCode: "RU",
        contactName: "Тест Тестов",
        phone: "+79000000000",
        city: "Москва",
        addressString: "ул. Тверская, д. 1",
      },
    }),
    OFFER_136,
    CREDS_TYPE1,
  );
  assert.deepEqual(body.to_location, {
    city: "Москва",
    address: "ул. Тверская, д. 1",
  });
  assert.equal("delivery_point" in body, false);
});

test("PVZ order emits delivery_point and no to_location", () => {
  const body = buildCdekOrderBody(
    baseInput({ pointOutId: "MSK65" }),
    OFFER_136,
    CREDS_TYPE1,
  );
  assert.equal(body.delivery_point, "MSK65");
  assert.equal("to_location" in body, false);
});

test('contractType "2" produces type: 2', () => {
  const body = buildCdekOrderBody(
    baseInput({ pointOutId: "MSK65" }),
    OFFER_136,
    CREDS_TYPE2,
  );
  assert.equal(body.type, 2);
});

test("offerId that is not cdek:<number> throws", () => {
  assert.throws(
    () =>
      buildCdekOrderBody(
        baseInput({ pointOutId: "MSK65" }),
        { ...OFFER_136, offerId: "yataxi:abc" },
        CREDS_TYPE1,
      ),
    (err) =>
      err instanceof Error &&
      err.message.startsWith("CDEK_OFFER_ID_INVALID:"),
  );
  assert.throws(
    () =>
      buildCdekOrderBody(
        baseInput({ pointOutId: "MSK65" }),
        { ...OFFER_136, offerId: "cdek:not-a-number" },
        CREDS_TYPE1,
      ),
    (err) =>
      err instanceof Error &&
      err.message.startsWith("CDEK_OFFER_ID_INVALID:"),
  );
});

test("empty items array throws before anything else", () => {
  assert.throws(
    () =>
      buildCdekOrderBody(
        baseInput({ items: [], pointOutId: "MSK65" }),
        { ...OFFER_136, offerId: "not-even-cdek" },
        { account: "x" },
      ),
    (err) =>
      err instanceof Error &&
      err.message === "CDEK_INPUT_INVALID: at least one item is required",
  );
});
