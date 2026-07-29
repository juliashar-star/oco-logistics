import assert from "node:assert/strict";
import test from "node:test";

import { ORDER_ADAPTERS } from "../packages/core/src/carrier-adapter/order-adapters.ts";
import {
  DEFAULT_ORDER_ADAPTER_KEY,
  orderAdapterSellerTitle,
} from "../packages/core/src/carrier-adapter/order-adapter-seller-titles.ts";
import {
  ORDER_ADAPTER_LABEL_SUPPORT,
  orderAdapterSupportsLabel,
} from "../packages/core/src/carrier-adapter/order-adapter-label-support.ts";
import { PROVIDER_SELLER_DISPLAY_NAMES } from "../packages/core/src/carrier-adapter/provider-seller-display-names.ts";
import {
  shipmentCarrierLabel,
  shipmentLabelCell,
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

test("DRIFT GUARD: every ORDER_ADAPTERS key is an own key of ORDER_ADAPTER_LABEL_SUPPORT", () => {
  assert.ok(
    Object.prototype.hasOwnProperty.call(
      ORDER_ADAPTER_LABEL_SUPPORT,
      DEFAULT_ORDER_ADAPTER_KEY,
    ),
    `DEFAULT_ORDER_ADAPTER_KEY ${JSON.stringify(DEFAULT_ORDER_ADAPTER_KEY)} must be an own key of ORDER_ADAPTER_LABEL_SUPPORT`,
  );

  for (const [key, entry] of Object.entries(ORDER_ADAPTERS)) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(ORDER_ADAPTER_LABEL_SUPPORT, key),
      `ORDER_ADAPTERS key ${JSON.stringify(key)} missing from ORDER_ADAPTER_LABEL_SUPPORT (fallback would hide this drift)`,
    );
    assert.equal(
      orderAdapterSupportsLabel(key),
      typeof entry.generateLabels === "function",
      `label support value drifted for ${key}`,
    );
  }
});

test("shipmentLabelCell: null orderAdapterKey → next_day → download link", () => {
  assert.deepEqual(
    shipmentLabelCell({
      id: "ship-1",
      status: "CREATED",
      labelUrl: null,
      providerKey: "yataxi",
      orderAdapterKey: null,
    }),
    { kind: "download", href: "/api/shipments/ship-1/label" },
  );
});

test("shipmentLabelCell: Express → not_required, never a link", () => {
  assert.deepEqual(
    shipmentLabelCell({
      id: "ship-ex",
      status: "CREATED",
      labelUrl: null,
      providerKey: "yataxi",
      orderAdapterKey: "yataxi:express",
    }),
    { kind: "not_required" },
  );
});

test("shipmentLabelCell: CANCELED with legacy labelUrl → none (defect fix)", () => {
  assert.deepEqual(
    shipmentLabelCell({
      id: "ship-legacy",
      status: "CANCELED",
      labelUrl: "https://example.com/label.pdf",
      providerKey: null,
      orderAdapterKey: null,
    }),
    { kind: "none" },
  );
});

test("shipmentLabelCell: status outside allow-list → none", () => {
  for (const status of [
    "DRAFT",
    "SUBMITTING",
    "DELIVERED",
    "RETURNED",
    "PROBLEM",
  ]) {
    assert.deepEqual(
      shipmentLabelCell({
        id: "ship-x",
        status,
        labelUrl: null,
        providerKey: "yataxi",
        orderAdapterKey: "yataxi:next_day",
      }),
      { kind: "none" },
      `expected none for status ${status}`,
    );
  }
});

test("shipmentLabelCell: CREATED legacy labelUrl → external", () => {
  assert.deepEqual(
    shipmentLabelCell({
      id: "ship-legacy",
      status: "CREATED",
      labelUrl: "https://example.com/label.pdf",
      providerKey: null,
      orderAdapterKey: null,
    }),
    { kind: "external", href: "https://example.com/label.pdf" },
  );
});
