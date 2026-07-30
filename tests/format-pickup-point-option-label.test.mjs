import assert from "node:assert/strict";
import test from "node:test";

import { formatPickupPointOptionLabel } from "../apps/web/lib/shipments/format-pickup-point-option-label.ts";

test("pickup_point keeps name — address", () => {
  assert.equal(
    formatPickupPointOptionLabel({
      kind: "pickup_point",
      name: "Пункт на Тверской",
      address: "ул. Тверская, 1",
    }),
    "Пункт на Тверской — ул. Тверская, 1",
  );
});

test("postamat prefixes Постамат", () => {
  assert.equal(
    formatPickupPointOptionLabel({
      kind: "postamat",
      name: "Постамат Яндекс Маркет",
      address: "ул. Арбат, 10",
    }),
    "Постамат — Постамат Яндекс Маркет — ул. Арбат, 10",
  );
});

test("warehouse prefixes Склад", () => {
  assert.equal(
    formatPickupPointOptionLabel({
      kind: "warehouse",
      name: "Склад Север",
      address: "промзона 3",
    }),
    "Склад — Склад Север — промзона 3",
  );
});

test("unknown keeps name — address (no prefix)", () => {
  assert.equal(
    formatPickupPointOptionLabel({
      kind: "unknown",
      name: "Точка",
      address: "Адрес",
    }),
    "Точка — Адрес",
  );
});

test("non-darkstore postamat is byte-identical to today's kind-only label", () => {
  assert.equal(
    formatPickupPointOptionLabel({
      kind: "postamat",
      name: "Постамат Яндекс Маркет",
      address: "ул. Арбат, 10",
      isDarkStore: false,
    }),
    "Постамат — Постамат Яндекс Маркет — ул. Арбат, 10",
  );
});

test("non-darkstore pickup_point stays unprefixed (byte-identical)", () => {
  assert.equal(
    formatPickupPointOptionLabel({
      kind: "pickup_point",
      name: "Пункт на Тверской",
      address: "ул. Тверская, 1",
      isDarkStore: false,
    }),
    "Пункт на Тверской — ул. Тверская, 1",
  );
});

test("darkstore postamat: mark on kind word at start", () => {
  assert.equal(
    formatPickupPointOptionLabel({
      kind: "postamat",
      name: "Лучше чем МП",
      address: "Москва, 2-й Карачаровский проезд 1",
      isDarkStore: true,
    }),
    "Постамат (даркстор) — Лучше чем МП — Москва, 2-й Карачаровский проезд 1",
  );
});

test("darkstore warehouse: Склад (даркстор) — …", () => {
  assert.equal(
    formatPickupPointOptionLabel({
      kind: "warehouse",
      name: "Склад Яндекс",
      address: "ул. Складская, 5",
      isDarkStore: true,
    }),
    "Склад (даркстор) — Склад Яндекс — ул. Складская, 5",
  );
});

test("darkstore pickup_point: Пункт выдачи (даркстор) — …", () => {
  assert.equal(
    formatPickupPointOptionLabel({
      kind: "pickup_point",
      name: "Пункт на Тверской",
      address: "ул. Тверская, 1",
      isDarkStore: true,
    }),
    "Пункт выдачи (даркстор) — Пункт на Тверской — ул. Тверская, 1",
  );
});

test("darkstore unknown: bare Даркстор — …", () => {
  assert.equal(
    formatPickupPointOptionLabel({
      kind: "unknown",
      name: "Точка",
      address: "Адрес",
      isDarkStore: true,
    }),
    "Даркстор — Точка — Адрес",
  );
});
