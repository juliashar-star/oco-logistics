import assert from "node:assert/strict";
import test from "node:test";

import { buildClaimsCreateBody } from "../packages/core/src/carrier-adapter/yandex/express-client.ts";

const OFFER = {
  offerId: "payload-from-calculate-abc",
  expiresAt: "2099-01-01T12:00:00+00:00",
  deliveryIntervalFrom: "2099-01-01T14:00:00+00:00",
  deliveryIntervalTo: "2099-01-01T16:00:00+00:00",
  pickupIntervalFrom: "2099-01-01T12:00:00+00:00",
  pickupIntervalTo: "2099-01-01T13:00:00+00:00",
  priceRub: 547.78,
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
  email: "warehouse@example.com",
  city: "Москва",
  addressString: "ул Складская, 1",
};

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

/** Named constant for the happy-path claims/create body shape. */
const EXPECTED_CLAIMS_CREATE_BODY = {
  items: [
    {
      title: "Посылка",
      cost_value: "100.00",
      cost_currency: "RUB",
      quantity: 1,
      size: { length: 0.3, width: 0.2, height: 0.1 },
      weight: 1,
      pickup_point: 1,
      dropoff_point: 2,
    },
  ],
  route_points: [
    {
      point_id: 1,
      visit_order: 1,
      type: "source",
      address: { fullname: "Москва, ул Складская, 1" },
      contact: {
        name: "OCO Test Warehouse",
        phone: "+74950000000",
        email: "warehouse@example.com",
      },
    },
    {
      point_id: 2,
      visit_order: 2,
      type: "destination",
      address: { fullname: "Москва, ул Тверская, д 1" },
      contact: {
        name: "Иванов Иван",
        phone: "+79001234567",
      },
    },
  ],
  offer_payload: "payload-from-calculate-abc",
};

test("buildClaimsCreateBody happy shape matches named constant", () => {
  assert.deepEqual(buildClaimsCreateBody(OFFER, baseInput()), EXPECTED_CLAIMS_CREATE_BODY);
});

test("buildClaimsCreateBody DOES contain the recipient name and phone", () => {
  // Opposite of getExpressOffers' calculate assertion (neither name nor phone).
  // Without this, stripping destination contact from create would still leave
  // both suites green.
  const body = buildClaimsCreateBody(OFFER, baseInput());
  const serialized = JSON.stringify(body);
  assert.match(serialized, /Иванов Иван/);
  assert.match(serialized, /\+79001234567/);
  const destination = body.route_points.find((p) => p.type === "destination");
  assert.equal(destination.contact.name, RECIPIENT.contactName);
  assert.equal(destination.contact.phone, RECIPIENT.phone);
});

test("buildClaimsCreateBody rejects missing sender email (does not send undefined)", () => {
  // Reject (throw), not silent omit: docs text requires email on source even
  // though the OpenAPI schema does not; undefined on the wire would only fail
  // remotely after PII was already posted.
  assert.throws(
    () =>
      buildClaimsCreateBody(
        OFFER,
        baseInput({ sender: { ...SENDER, email: undefined } }),
      ),
    /sender email/,
  );
  assert.throws(
    () =>
      buildClaimsCreateBody(
        OFFER,
        baseInput({ sender: { ...SENDER, email: "   " } }),
      ),
    /sender email/,
  );
});
