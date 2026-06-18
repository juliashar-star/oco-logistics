/** Проверка сборки тела POST /orders для APIShip. */
import assert from "node:assert/strict";
import test from "node:test";

const DEFAULT_ASSESSED_COST_RUB = 100;

function buildCreateOrderPayload(input) {
  const assessedCost = input.assessedCostRub ?? DEFAULT_ASSESSED_COST_RUB;

  return {
    order: {
      clientNumber: input.clientNumber,
      weight: input.weightG,
      length: input.lengthCm,
      width: input.widthCm,
      height: input.heightCm,
      providerKey: input.providerKey,
      pickupType: input.pickupType ?? 1,
      deliveryType: input.deliveryType,
      tariffId: input.tariffId,
      ...(input.pointOutId != null ? { pointOutId: input.pointOutId } : {}),
    },
    sender: {
      countryCode: input.sender.countryCode,
      contactName: input.sender.contactName,
      phone: input.sender.phone,
      city: input.sender.city,
      ...(input.sender.addressString ? { addressString: input.sender.addressString } : {}),
    },
    recipient: {
      countryCode: input.recipient.countryCode,
      contactName: input.recipient.contactName,
      phone: input.recipient.phone,
      city: input.recipient.city,
      ...(input.recipient.addressString ? { addressString: input.recipient.addressString } : {}),
    },
    cost: {
      assessedCost,
      codCost: 0,
    },
    places: [
      {
        weight: input.weightG,
        height: input.heightCm,
        width: input.widthCm,
        length: input.lengthCm,
        items: [
          {
            description: "Посылка",
            quantity: 1,
            weight: input.weightG,
            assessedCost,
          },
        ],
      },
    ],
  };
}

test("buildCreateOrderPayload — ПВЗ с pointOutId и нулевой наложенный платёж", () => {
  const payload = buildCreateOrderPayload({
    clientNumber: "ship-1",
    providerKey: "cdek",
    tariffId: 55,
    deliveryType: 2,
    weightG: 1000,
    lengthCm: 30,
    widthCm: 20,
    heightCm: 10,
    pointOutId: 39718,
    sender: {
      countryCode: "RU",
      contactName: "OCO Test",
      phone: "+74950000000",
      city: "Москва",
      addressString: "Москва, ул. Примерная, 1",
    },
    recipient: {
      countryCode: "RU",
      contactName: "Иванов Иван",
      phone: "+79991234567",
      city: "Санкт-Петербург",
    },
  });

  assert.equal(payload.order.clientNumber, "ship-1");
  assert.equal(payload.order.deliveryType, 2);
  assert.equal(payload.order.pointOutId, 39718);
  assert.equal(payload.cost.codCost, 0);
  assert.equal(payload.places[0].weight, 1000);
  assert.equal(payload.places[0].items[0].description, "Посылка");
});

test("buildCreateOrderPayload — курьер до двери", () => {
  const payload = buildCreateOrderPayload({
    clientNumber: "ship-2",
    providerKey: "boxberry",
    tariffId: 1,
    deliveryType: 1,
    weightG: 500,
    lengthCm: 20,
    widthCm: 15,
    heightCm: 10,
    assessedCostRub: 250,
    sender: {
      countryCode: "RU",
      contactName: "Sender",
      phone: "+74950000000",
      city: "Москва",
    },
    recipient: {
      countryCode: "RU",
      contactName: "Получатель",
      phone: "+79990000000",
      city: "Казань",
      addressString: "Казань, ул. Баумана, 1",
    },
  });

  assert.equal(payload.order.deliveryType, 1);
  assert.equal(payload.order.pointOutId, undefined);
  assert.equal(payload.cost.assessedCost, 250);
  assert.equal(payload.recipient.addressString, "Казань, ул. Баумана, 1");
});
