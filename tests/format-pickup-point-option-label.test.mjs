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
