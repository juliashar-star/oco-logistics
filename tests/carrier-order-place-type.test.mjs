import assert from "node:assert/strict";
import test from "node:test";

/**
 * SHAPE, NOT ARITHMETIC. Nothing reads `places` yet, so there is no behaviour to
 * assert — what these tests pin is that the neutral contract can EXPRESS a
 * multi-place order at all, and that the single-place shape it replaces is
 * still expressible unchanged. When a reader appears, its own slice tests it.
 *
 * .mjs cannot check types at runtime; `npm run typecheck` is what proves these
 * objects satisfy CarrierCreateOrderInput. These assertions guard the structure
 * a reader will walk: place numbers, per-place items, and the item count.
 */

const SENDER = {
  countryCode: "RU",
  contactName: "Seller",
  phone: "+74951234567",
  city: "Москва",
};

const RECIPIENT = {
  countryCode: "RU",
  contactName: "Тест Тестов",
  phone: "+79000000000",
  city: "Москва",
  addressString: "ул. Тверская, д. 1",
};

const ITEM_A = {
  name: "Товар А",
  quantity: 2,
  unitPriceRub: 100,
  weightG: 500,
  lengthCm: 30,
  widthCm: 20,
  heightCm: 10,
};

const ITEM_B = {
  name: "Товар Б",
  quantity: 1,
  unitPriceRub: 50,
  weightG: 300,
  lengthCm: 40,
  widthCm: 15,
  heightCm: 25,
};

function baseInput(overrides = {}) {
  return {
    clientNumber: "ORDER-42",
    providerKey: "yataxi",
    sender: SENDER,
    recipient: RECIPIENT,
    items: [ITEM_A, ITEM_B],
    ...overrides,
  };
}

test("input without places: items stay required and places is absent", () => {
  const input = baseInput();

  assert.equal(input.places, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(input, "places"), false);
  assert.equal(input.items.length, 2);
});

test("two places, one item in each: order is the array order, and each carries its own item", () => {
  const input = baseInput({
    places: [
      { weightG: 1000, lengthCm: 30, widthCm: 20, heightCm: 10, items: [ITEM_A] },
      { weightG: 300, lengthCm: 40, widthCm: 15, heightCm: 25, items: [ITEM_B] },
    ],
  });

  // A place carries NO number: numbering belongs to the adapter, and the order
  // of the places is the order of the array. See CarrierOrderPlace in types.ts.
  for (const place of input.places) {
    assert.equal("number" in place, false);
  }
  assert.deepEqual(
    input.places.map((place) => place.items.map((item) => item.name)),
    [["Товар А"], ["Товар Б"]],
  );

  const placed = input.places.flatMap((place) => place.items);
  assert.equal(placed.length, input.items.length);
});

test("one place holding TWO items: a single box with two products", () => {
  const input = baseInput({
    places: [
      { weightG: 1300, lengthCm: 40, widthCm: 20, heightCm: 25, items: [ITEM_A, ITEM_B] },
    ],
  });

  assert.equal(input.places.length, 1);
  assert.equal("number" in input.places[0], false);
  assert.equal(input.places[0].items.length, 2);
  assert.deepEqual(
    input.places[0].items.map((item) => item.name),
    ["Товар А", "Товар Б"],
  );

  const placed = input.places.flatMap((place) => place.items);
  assert.equal(placed.length, input.items.length);
});

test("place dimensions are optional: weight and items alone are a valid place", () => {
  const input = baseInput({
    items: [ITEM_A],
    places: [{ weightG: 1000, items: [ITEM_A] }],
  });

  assert.equal(input.places[0].lengthCm, undefined);
  assert.equal(input.places[0].widthCm, undefined);
  assert.equal(input.places[0].heightCm, undefined);
  assert.equal(input.places[0].weightG, 1000);
  assert.equal(input.places[0].items.length, 1);
});
