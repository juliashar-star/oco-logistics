import assert from "node:assert/strict";
import test from "node:test";

import { orderAdapterSellerTitle } from "../packages/core/src/carrier-adapter/order-adapter-seller-titles.ts";
import { PROVIDER_SELLER_DISPLAY_NAMES } from "../packages/core/src/carrier-adapter/provider-seller-display-names.ts";
import {
  shipmentCarrierLabel,
  shipmentTariffLabel,
} from "../apps/web/lib/shipments/shipment-list-labels.ts";

test("PROVIDER_SELLER_DISPLAY_NAMES masks yataxi as Перевозчик №1", () => {
  assert.equal(PROVIDER_SELLER_DISPLAY_NAMES.yataxi, "Перевозчик №1");
});

test("shipmentCarrierLabel: providerKey set → masked display name", () => {
  assert.equal(
    shipmentCarrierLabel({
      providerKey: "yataxi",
      orderAdapterKey: "yataxi:next_day",
      carrier: { name: "LEGACY" },
    }),
    "Перевозчик №1",
  );
});

test("shipmentCarrierLabel: providerKey null → legacy carrier name", () => {
  assert.equal(
    shipmentCarrierLabel({
      providerKey: null,
      orderAdapterKey: null,
      carrier: { name: "СДЭК" },
    }),
    "СДЭК",
  );
});

test("shipmentCarrierLabel: neither → em dash", () => {
  assert.equal(
    shipmentCarrierLabel({
      providerKey: null,
      orderAdapterKey: null,
      carrier: null,
    }),
    "—",
  );
});

test("shipmentTariffLabel: providerKey null → em dash (legacy)", () => {
  assert.equal(
    shipmentTariffLabel({
      providerKey: null,
      orderAdapterKey: "yataxi:next_day",
      carrier: { name: "X" },
    }),
    "—",
  );
});

test("shipmentTariffLabel: uses orderAdapterSellerTitle; null key → default entry", () => {
  const label = shipmentTariffLabel({
    providerKey: "yataxi",
    orderAdapterKey: null,
    carrier: null,
  });
  assert.equal(label, orderAdapterSellerTitle(null));
  assert.equal(label, "Доставка на следующий день");
});

test("shipmentTariffLabel: explicit orderAdapterKey", () => {
  assert.equal(
    shipmentTariffLabel({
      providerKey: "yataxi",
      orderAdapterKey: "yataxi:next_day",
      carrier: null,
    }),
    orderAdapterSellerTitle("yataxi:next_day"),
  );
});
