import assert from "node:assert/strict";
import test from "node:test";

import { normalizeOrderPlaces } from "../packages/core/src/carrier-adapter/normalize-order-places.ts";

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

const ITEM_C = {
  name: "Товар В",
  quantity: 1,
  unitPriceRub: 70,
  weightG: 200,
};

function baseInput(overrides = {}) {
  return {
    clientNumber: "ORDER-42",
    providerKey: "cdek",
    sender: { countryCode: "RU", contactName: "Seller", phone: "+74951234567", city: "Москва" },
    recipient: { countryCode: "RU", contactName: "Тест", phone: "+79000000000", city: "Москва" },
    items: [ITEM_A],
    ...overrides,
  };
}

test("no places: one place, weight counts quantity", () => {
  const places = normalizeOrderPlaces(baseInput());

  assert.equal(places.length, 1);
  assert.equal(places[0].number, 1);
  // ITEM_A is 500 g × quantity 2. The old branch reported 500 and dropped the
  // quantity; parcelFitsServiceLimits and computePlaceFromItems always counted it.
  assert.equal(places[0].weightG, 1000);
  assert.equal(places[0].lengthCm, 30);
  assert.equal(places[0].widthCm, 20);
  assert.equal(places[0].heightCm, 10);
  assert.equal(places[0].items.length, 1);
  assert.equal(places[0].items[0].item, ITEM_A);
  assert.equal(places[0].items[0].positionIndex, 1);
});

test("no places: EVERY item lands in the single place, not just the first", () => {
  const places = normalizeOrderPlaces(baseInput({ items: [ITEM_A, ITEM_B, ITEM_C] }));

  assert.equal(places.length, 1);
  assert.deepEqual(
    places[0].items.map((entry) => entry.item.name),
    ["Товар А", "Товар Б", "Товар В"],
  );
  assert.deepEqual(
    places[0].items.map((entry) => entry.positionIndex),
    [1, 2, 3],
  );
  // 500×2 + 300×1 + 200×1 = 1500.
  assert.equal(places[0].weightG, 1500);
  // Sides are the per-axis maximum over the items — computePlaceFromItems.
  assert.equal(places[0].lengthCm, 40);
  assert.equal(places[0].widthCm, 20);
  assert.equal(places[0].heightCm, 25);
});

test("no places, no item declares an axis: that axis stays ABSENT, never a filler 1", () => {
  const noDims = { name: "Без габаритов", quantity: 1, unitPriceRub: 10, weightG: 200 };
  const places = normalizeOrderPlaces(baseInput({ items: [noDims] }));

  assert.equal(places.length, 1);
  assert.equal(places[0].weightG, 200);
  assert.equal("lengthCm" in places[0], false);
  assert.equal("widthCm" in places[0], false);
  assert.equal("heightCm" in places[0], false);
});

test("declared place holding no items is refused", () => {
  assert.throws(
    () =>
      normalizeOrderPlaces(
        baseInput({
          items: [ITEM_A],
          places: [{ weightG: 1000, items: [] }],
        }),
      ),
    (err) => err instanceof Error && err.message.startsWith("ORDER_PLACE_EMPTY:"),
  );
});

test("the refusal names WHICH place is empty", () => {
  assert.throws(
    () =>
      normalizeOrderPlaces(
        baseInput({
          items: [ITEM_A, ITEM_B],
          places: [
            { weightG: 1000, items: [ITEM_A] },
            { weightG: 300, items: [] },
          ],
        }),
      ),
    (err) => err instanceof Error && err.message === "ORDER_PLACE_EMPTY: place 2 has no items",
  );
});

test("no places and no items: empty list, so callers can refuse it themselves", () => {
  assert.deepEqual(normalizeOrderPlaces(baseInput({ items: [] })), []);
});

test("two places: numbers are 1 and 2 in declaration order", () => {
  const places = normalizeOrderPlaces(
    baseInput({
      items: [ITEM_A, ITEM_B],
      places: [
        { weightG: 1000, lengthCm: 30, widthCm: 20, heightCm: 10, items: [ITEM_A] },
        { weightG: 300, lengthCm: 40, widthCm: 15, heightCm: 25, items: [ITEM_B] },
      ],
    }),
  );

  assert.equal(places.length, 2);
  // Numbering is OURS: the caller's own numbers are replaced by 1..N so the
  // uniqueness Приложение №3 п. 4.1 requires cannot depend on the caller.
  assert.deepEqual(places.map((place) => place.number), [1, 2]);
  assert.equal(places[0].weightG, 1000);
  assert.equal(places[1].weightG, 300);
});

test("position index runs across the ORDER: two items in the second place continue the count", () => {
  const places = normalizeOrderPlaces(
    baseInput({
      items: [ITEM_A, ITEM_B, ITEM_C],
      places: [
        { weightG: 1000, items: [ITEM_A] },
        { weightG: 500, items: [ITEM_B, ITEM_C] },
      ],
    }),
  );

  assert.deepEqual(
    places.map((place) => place.items.map((entry) => entry.positionIndex)),
    [[1], [2, 3]],
  );
  // The ware_key each index produces, spelled out: ORDER-42-1, -2, -3.
  const wareKeys = places.flatMap((place) =>
    place.items.map((entry) => `ORDER-42-${entry.positionIndex}`),
  );
  assert.deepEqual(wareKeys, ["ORDER-42-1", "ORDER-42-2", "ORDER-42-3"]);
  assert.equal(new Set(wareKeys).size, 3);
});

test("cost total across all places equals the sum of every item's unitPriceRub", () => {
  const places = normalizeOrderPlaces(
    baseInput({
      items: [ITEM_A, ITEM_B, ITEM_C],
      places: [
        { weightG: 1000, items: [ITEM_A] },
        { weightG: 500, items: [ITEM_B, ITEM_C] },
      ],
    }),
  );

  const total = places.reduce(
    (sum, place) => sum + place.items.reduce((acc, { item }) => acc + item.unitPriceRub, 0),
    0,
  );
  assert.equal(total, 220);
});

test("a place without dimensions keeps them ABSENT — no measuring of its items", () => {
  const places = normalizeOrderPlaces(
    baseInput({
      items: [ITEM_A],
      places: [{ weightG: 1000, items: [ITEM_A] }],
    }),
  );

  assert.equal("lengthCm" in places[0], false);
  assert.equal("widthCm" in places[0], false);
  assert.equal("heightCm" in places[0], false);
  // ITEM_A does carry 30/20/10; the place still reports nothing.
  assert.equal(places[0].items[0].item.lengthCm, 30);
});

test("empty places array falls back to the single-place branch, not to zero places", () => {
  const places = normalizeOrderPlaces(baseInput({ places: [] }));

  assert.equal(places.length, 1);
  assert.equal(places[0].number, 1);
  assert.equal(places[0].items[0].item, ITEM_A);
});
