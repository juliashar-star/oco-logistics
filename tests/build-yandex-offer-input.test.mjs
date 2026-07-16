import assert from "node:assert/strict";
import test from "node:test";

import { deriveOperatorRequestId } from "../apps/web/lib/shipments/operator-request-id.ts";
import {
  buildYandexOfferInput,
} from "../apps/web/lib/shipments/build-yandex-offer-input.ts";

const COMPANY = {
  name: "Брэнд Тест",
  inn: "7707083893",
  contactEmail: "seller@example.com",
  senderCity: "Москва",
  senderAddress: "ул. Складская, 1",
  senderPhone: "+74951234567",
};

function baseShipment(overrides = {}) {
  return {
    companyId: "co-1",
    idempotencyKey: "idem-1",
    declaredValue: 150_000, // 1500.00 ₽ in kopecks
    weightG: 1200,
    lengthCm: 30,
    widthCm: 20,
    heightCm: 10,
    pickupType: "COURIER",
    pvzCode: null,
    destCity: "Москва",
    destAddress: "ул. Тверская, д. 1",
    recipientName: "Иванов Иван",
    recipientPhone: "+79001234567",
    ...overrides,
  };
}

test("no_declared_value when declaredValue is null", () => {
  const result = buildYandexOfferInput({
    shipment: baseShipment({ declaredValue: null }),
    company: COMPANY,
  });
  assert.deepEqual(result, { ok: false, reason: "no_declared_value" });
});

test("no_declared_value when declaredValue is 0", () => {
  const result = buildYandexOfferInput({
    shipment: baseShipment({ declaredValue: 0 }),
    company: COMPANY,
  });
  assert.deepEqual(result, { ok: false, reason: "no_declared_value" });
});

test("no_declared_value when declaredValue is negative", () => {
  const result = buildYandexOfferInput({
    shipment: baseShipment({ declaredValue: -100 }),
    company: COMPANY,
  });
  assert.deepEqual(result, { ok: false, reason: "no_declared_value" });
});

test("no_idempotency_key when idempotencyKey is null", () => {
  const result = buildYandexOfferInput({
    shipment: baseShipment({ idempotencyKey: null }),
    company: COMPANY,
  });
  assert.deepEqual(result, { ok: false, reason: "no_idempotency_key" });
});

test("no_sender when company has no senderCity", () => {
  const result = buildYandexOfferInput({
    shipment: baseShipment(),
    company: { ...COMPANY, senderCity: null },
  });
  assert.deepEqual(result, { ok: false, reason: "no_sender" });
});

test("no_destination for PVZ without pvzCode", () => {
  const result = buildYandexOfferInput({
    shipment: baseShipment({
      pickupType: "PVZ",
      pvzCode: "  ",
      destAddress: null,
    }),
    company: COMPANY,
  });
  assert.deepEqual(result, { ok: false, reason: "no_destination" });
});

test("no_destination for COURIER without destAddress", () => {
  const result = buildYandexOfferInput({
    shipment: baseShipment({
      pickupType: "COURIER",
      destAddress: null,
    }),
    company: COMPANY,
  });
  assert.deepEqual(result, { ok: false, reason: "no_destination" });
});

test("UNITS: declaredValue 1500000 kopecks → unitPriceRub 15000 and assessedCostRub 15000", () => {
  const result = buildYandexOfferInput({
    shipment: baseShipment({ declaredValue: 1_500_000 }),
    company: COMPANY,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.input.assessedCostRub, 15_000);
  assert.equal(result.input.items.length, 1);
  assert.equal(result.input.items[0].unitPriceRub, 15_000);
  assert.notEqual(result.input.items[0].unitPriceRub, 1_500_000);
  assert.notEqual(result.input.assessedCostRub, 1_500_000);
});

test("PVZ happy path: pointOutId set, no addressString, synthetic item Посылка", () => {
  const shipment = baseShipment({
    pickupType: "PVZ",
    pvzCode: "019c6bee642d770a937e0d33b27f6467",
    destAddress: null,
    declaredValue: 250_00, // 250 ₽
  });
  const result = buildYandexOfferInput({ shipment, company: COMPANY });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.input.providerKey, "yataxi");
  assert.equal(result.input.pointOutId, "019c6bee642d770a937e0d33b27f6467");
  assert.equal(result.input.recipient.addressString, undefined);
  assert.equal(
    result.input.clientNumber,
    deriveOperatorRequestId(shipment.companyId, shipment.idempotencyKey),
  );
  assert.deepEqual(result.input.items, [
    {
      name: "Посылка",
      quantity: 1,
      unitPriceRub: 250,
      weightG: 1200,
      lengthCm: 30,
      widthCm: 20,
      heightCm: 10,
    },
  ]);
  assert.equal(result.input.assessedCostRub, 250);
  assert.equal(result.input.sender.contactName, COMPANY.name);
  assert.equal(result.input.sender.phone, COMPANY.senderPhone);
  assert.equal(result.input.recipient.contactName, "Иванов Иван");
  assert.equal(result.input.recipient.city, "Москва");
});

test("COURIER happy path: addressString set, no pointOutId", () => {
  const result = buildYandexOfferInput({
    shipment: baseShipment({
      pickupType: "COURIER",
      destAddress: "ул. Тверская, д. 1",
      pvzCode: "should-be-ignored",
    }),
    company: COMPANY,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.input.pointOutId, undefined);
  assert.equal(result.input.recipient.addressString, "ул. Тверская, д. 1");
  assert.equal(result.input.items[0].name, "Посылка");
});

test("no_sender_phone when company.senderPhone blank", () => {
  const result = buildYandexOfferInput({
    shipment: baseShipment(),
    company: { ...COMPANY, senderPhone: "  " },
  });
  assert.deepEqual(result, { ok: false, reason: "no_sender_phone" });
});
