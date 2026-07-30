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
      name: "Лучше чем МП",
      address: "ул. Арбат, 10",
    }),
    "Постамат — Лучше чем МП — ул. Арбат, 10",
  );
});

test("warehouse prefixes Склад", () => {
  assert.equal(
    formatPickupPointOptionLabel({
      kind: "warehouse",
      name: "Северный хаб",
      address: "промзона 3",
    }),
    "Склад — Северный хаб — промзона 3",
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

test("postamat name already starts with Постамат → no prefix added", () => {
  assert.equal(
    formatPickupPointOptionLabel({
      kind: "postamat",
      name: "Постамат Яндекс Маркет",
      address: "ул. Арбат, 10",
    }),
    "Постамат Яндекс Маркет — ул. Арбат, 10",
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
    "(даркстор) Склад Яндекс — ул. Складская, 5",
  );
});

test("darkstore pickup_point: ПВЗ (даркстор) — …", () => {
  assert.equal(
    formatPickupPointOptionLabel({
      kind: "pickup_point",
      name: "Пункт на Тверской",
      address: "ул. Тверская, 1",
      isDarkStore: true,
    }),
    "ПВЗ (даркстор) — Пункт на Тверской — ул. Тверская, 1",
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

test("postamat name lowercase Постамат → no prefix added", () => {
  assert.equal(
    formatPickupPointOptionLabel({
      kind: "postamat",
      name: "постамат Яндекс Маркет",
      address: "ул. Арбат, 10",
    }),
    "постамат Яндекс Маркет — ул. Арбат, 10",
  );
});

test("postamat name with leading whitespace before Постамат → no prefix added", () => {
  assert.equal(
    formatPickupPointOptionLabel({
      kind: "postamat",
      name: " Постамат Яндекс Маркет",
      address: "ул. Арбат, 10",
    }),
    "Постамат Яндекс Маркет — ул. Арбат, 10",
  );
});

test("postamat name contains постамата later → prefix IS added", () => {
  assert.equal(
    formatPickupPointOptionLabel({
      kind: "postamat",
      name: "Пункт у постамата",
      address: "ул. Ленина, 2",
    }),
    "Постамат — Пункт у постамата — ул. Ленина, 2",
  );
});

test("warehouse name already starts with Склад → no prefix added", () => {
  assert.equal(
    formatPickupPointOptionLabel({
      kind: "warehouse",
      name: "Склад Север",
      address: "промзона 3",
    }),
    "Склад Север — промзона 3",
  );
});

test("warehouse name contains склад later → prefix IS added", () => {
  assert.equal(
    formatPickupPointOptionLabel({
      kind: "warehouse",
      name: "Точка у склада",
      address: "промзона 3",
    }),
    "Склад — Точка у склада — промзона 3",
  );
});

test("darkstore pickup_point name already starts with ПВЗ → mark alone leading", () => {
  assert.equal(
    formatPickupPointOptionLabel({
      kind: "pickup_point",
      name: "ПВЗ на Тверской",
      address: "ул. Тверская, 1",
      isDarkStore: true,
    }),
    "(даркстор) ПВЗ на Тверской — ул. Тверская, 1",
  );
});

test("pickup_point name contains ПВЗ later + darkstore → ПВЗ prefix kept", () => {
  assert.equal(
    formatPickupPointOptionLabel({
      kind: "pickup_point",
      name: "Пункт рядом с ПВЗ",
      address: "ул. Тверская, 1",
      isDarkStore: true,
    }),
    "ПВЗ (даркстор) — Пункт рядом с ПВЗ — ул. Тверская, 1",
  );
});

test("darkstore postamat with suppressed prefix: mark alone leading", () => {
  assert.equal(
    formatPickupPointOptionLabel({
      kind: "postamat",
      name: "Постамат Яндекс Маркет",
      address: "ул. Арбат, 10",
      isDarkStore: true,
    }),
    "(даркстор) Постамат Яндекс Маркет — ул. Арбат, 10",
  );
});

test("darkstore postamat without suppressed prefix: kind word + mark", () => {
  assert.equal(
    formatPickupPointOptionLabel({
      kind: "postamat",
      name: "Лучше чем МП",
      address: "ул. Арбат, 10",
      isDarkStore: true,
    }),
    "Постамат (даркстор) — Лучше чем МП — ул. Арбат, 10",
  );
});
