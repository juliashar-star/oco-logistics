import assert from "node:assert/strict";
import test from "node:test";

import {
  pickupPointFilterStatusLine,
  visiblePickupPointOptions,
} from "../apps/web/lib/shipments/visible-pickup-point-options.ts";

const A = { point: { id: "a" }, label: "Постамат — Лучше чем МП — ул. Арбат, 10" };
const B = { point: { id: "b" }, label: "Пункт на Тверской — ул. Тверская, 1" };
const C = { point: { id: "c" }, label: "Склад — Северный хаб — промзона 3" };
const ALL = [A, B, C];

test("no query returns everything", () => {
  assert.deepEqual(visiblePickupPointOptions(ALL, "", null), {
    options: ALL,
    matchCount: 3,
    selectionPinned: false,
  });
  assert.deepEqual(visiblePickupPointOptions(ALL, "   ", ""), {
    options: ALL,
    matchCount: 3,
    selectionPinned: false,
  });
});

test("a query returns only matches", () => {
  assert.deepEqual(visiblePickupPointOptions(ALL, "тверская", null), {
    options: [B],
    matchCount: 1,
    selectionPinned: false,
  });
  assert.deepEqual(visiblePickupPointOptions(ALL, "арбат 10", null), {
    options: [A],
    matchCount: 1,
    selectionPinned: false,
  });
});

test("selected point that matches keeps natural position and is not duplicated", () => {
  assert.deepEqual(visiblePickupPointOptions(ALL, "тверская", "b"), {
    options: [B],
    matchCount: 1,
    selectionPinned: false,
  });
  assert.deepEqual(visiblePickupPointOptions(ALL, "", "b"), {
    options: ALL,
    matchCount: 3,
    selectionPinned: false,
  });
});

test("selected point that does not match is present anyway and comes last", () => {
  // Was «comes first»; pin now follows matches so matches occupy visible rows.
  assert.deepEqual(visiblePickupPointOptions(ALL, "тверская", "a"), {
    options: [B, A],
    matchCount: 1,
    selectionPinned: true,
  });
  assert.deepEqual(visiblePickupPointOptions(ALL, "неттакого", "c"), {
    options: [C],
    matchCount: 0,
    selectionPinned: true,
  });
});

test("selected id not in the list is ignored without throwing", () => {
  assert.deepEqual(visiblePickupPointOptions(ALL, "тверская", "missing"), {
    options: [B],
    matchCount: 1,
    selectionPinned: false,
  });
  assert.deepEqual(visiblePickupPointOptions(ALL, "", "missing"), {
    options: ALL,
    matchCount: 3,
    selectionPinned: false,
  });
});

test("nothing selected plus a query matching nothing returns empty", () => {
  assert.deepEqual(visiblePickupPointOptions(ALL, "неттакого", null), {
    options: [],
    matchCount: 0,
    selectionPinned: false,
  });
  assert.deepEqual(visiblePickupPointOptions(ALL, "неттакого", ""), {
    options: [],
    matchCount: 0,
    selectionPinned: false,
  });
});

test("status: matches > 0, nothing pinned", () => {
  assert.equal(
    pickupPointFilterStatusLine(
      { matchCount: 2, selectionPinned: false },
      "арбат",
      809,
    ),
    "Показано 2 из 809",
  );
});

test("status: matches > 0 and selection pinned", () => {
  assert.equal(
    pickupPointFilterStatusLine(
      { matchCount: 1, selectionPinned: true },
      "тверская",
      809,
    ),
    "Показано 1 из 809; выбранный пункт тоже показан ниже",
  );
});

test("status: matches == 0 and selection pinned", () => {
  assert.equal(
    pickupPointFilterStatusLine(
      { matchCount: 0, selectionPinned: true },
      "неттакого",
      809,
    ),
    "Совпадений нет — показан только выбранный пункт",
  );
});

test("status: matches == 0, nothing pinned", () => {
  assert.equal(
    pickupPointFilterStatusLine(
      { matchCount: 0, selectionPinned: false },
      "неттакого",
      809,
    ),
    "Ничего не найдено по этому фильтру",
  );
});

test("status: empty query or empty list → null", () => {
  assert.equal(
    pickupPointFilterStatusLine({ matchCount: 3, selectionPinned: false }, "", 809),
    null,
  );
  assert.equal(
    pickupPointFilterStatusLine(
      { matchCount: 0, selectionPinned: false },
      "арбат",
      0,
    ),
    null,
  );
});
