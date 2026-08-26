import assert from "node:assert/strict";
import test from "node:test";

import { deriveOperatorRequestId } from "../apps/web/lib/shipments/operator-request-id.ts";
import { buildOfferInput } from "../apps/web/lib/shipments/build-offer-input.ts";

const PROVIDER_KEY = "yataxi";

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
    handoverMode: "DROP_OFF",
    ...overrides,
  };
}

function build(args) {
  return buildOfferInput({ providerKey: PROVIDER_KEY, ...args });
}

test("no_declared_value when declaredValue is null", () => {
  const result = build({
    shipment: baseShipment({ declaredValue: null }),
    company: COMPANY,
  });
  assert.deepEqual(result, { ok: false, reason: "no_declared_value" });
});

test("no_declared_value when declaredValue is 0", () => {
  const result = build({
    shipment: baseShipment({ declaredValue: 0 }),
    company: COMPANY,
  });
  assert.deepEqual(result, { ok: false, reason: "no_declared_value" });
});

test("no_declared_value when declaredValue is negative", () => {
  const result = build({
    shipment: baseShipment({ declaredValue: -100 }),
    company: COMPANY,
  });
  assert.deepEqual(result, { ok: false, reason: "no_declared_value" });
});

test("no_idempotency_key when idempotencyKey is null", () => {
  const result = build({
    shipment: baseShipment({ idempotencyKey: null }),
    company: COMPANY,
  });
  assert.deepEqual(result, { ok: false, reason: "no_idempotency_key" });
});

test("no_sender when company has no senderCity", () => {
  const result = build({
    shipment: baseShipment(),
    company: { ...COMPANY, senderCity: null },
  });
  assert.deepEqual(result, { ok: false, reason: "no_sender" });
});

test("no_destination for PVZ without pvzCode", () => {
  const result = build({
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
  const result = build({
    shipment: baseShipment({
      pickupType: "COURIER",
      destAddress: null,
    }),
    company: COMPANY,
  });
  assert.deepEqual(result, { ok: false, reason: "no_destination" });
});

test("UNITS: declaredValue 1500000 kopecks → unitPriceRub 15000 and assessedCostRub 15000", () => {
  const result = build({
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
  const result = build({ shipment, company: COMPANY });
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
  const result = build({
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
  assert.equal(result.input.needsThermalBag, false);
});

test("buildOfferInput passes needsThermalBag from the shipment row", () => {
  const result = build({
    shipment: baseShipment({ needsThermalBag: true }),
    company: COMPANY,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.input.needsThermalBag, true);
});

test('handoverMode "DROP_OFF" is copied onto the input', () => {
  const result = build({
    shipment: baseShipment({ handoverMode: "DROP_OFF" }),
    company: COMPANY,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.input.handoverMode, "DROP_OFF");
});

test('handoverMode "COURIER" is copied onto the input', () => {
  const result = build({
    shipment: baseShipment({ handoverMode: "COURIER" }),
    company: COMPANY,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.input.handoverMode, "COURIER");
});

test("only handoverMode differs when shipment handoverMode differs", () => {
  const dropOff = build({
    shipment: baseShipment({ handoverMode: "DROP_OFF" }),
    company: COMPANY,
  });
  const courier = build({
    shipment: baseShipment({ handoverMode: "COURIER" }),
    company: COMPANY,
  });
  assert.equal(dropOff.ok, true);
  assert.equal(courier.ok, true);
  if (!dropOff.ok || !courier.ok) return;

  const { handoverMode: _a, ...dropOffRest } = dropOff.input;
  const { handoverMode: _b, ...courierRest } = courier.input;
  assert.deepEqual(dropOffRest, courierRest);
});

test("no_sender_phone when company.senderPhone blank", () => {
  const result = build({
    shipment: baseShipment(),
    company: { ...COMPANY, senderPhone: "  " },
  });
  assert.deepEqual(result, { ok: false, reason: "no_sender_phone" });
});

test("providerKey comes from the registry argument, not a hardcode", () => {
  const result = buildOfferInput({
    shipment: baseShipment(),
    company: COMPANY,
    providerKey: "other-carrier",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.input.providerKey, "other-carrier");
});

/**
 * LOAD-BEARING FOR A RULE IN ANOTHER PACKAGE. `parcelFitsServiceLimits` answers
 * «does not fit» for an empty item list, and the offers fan-out applies that to
 * every service declaring limits — today all four. An empty array here would
 * therefore drop every carrier at once and tell the seller the parcel is too
 * large, about an order with no parcel in it. The only thing preventing that is
 * this array being a literal of length one. If a future slice makes items come
 * from the CRM ingest path, this test must fail rather than that behaviour
 * appearing silently on the offers screen.
 */
test("items is always exactly one synthetic entry — the empty-list guard depends on it", () => {
  for (const shipment of [
    baseShipment({
      pickupType: "PVZ",
      pvzCode: "019c6bee642d770a937e0d33b27f6467",
      destAddress: null,
      declaredValue: 250_00,
    }),
    baseShipment({
      pickupType: "COURIER",
      pvzCode: null,
      destAddress: "ул. Тверская, 1",
      declaredValue: 250_00,
    }),
  ]) {
    const result = build({ shipment, company: COMPANY });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(
      result.input.items.length,
      1,
      "an empty items array would drop every carrier with a misleading reason",
    );
    assert.ok(Number.isFinite(result.input.items[0].weightG));
  }
});
