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
      selectedOfferServiceName: null,
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
      selectedOfferServiceName: null,
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
      selectedOfferServiceName: null,
      carrier: null,
    }),
    "—",
  );
});

test("shipmentTariffLabel: providerKey null → em dash (legacy)", () => {
  // FIRST branch, before any name is considered: a row with no carrier has no
  // tariff to name either.
  assert.equal(
    shipmentTariffLabel({
      providerKey: null,
      orderAdapterKey: "yataxi:next_day",
      selectedOfferServiceName: "Посылка склад-склад",
      carrier: { name: "X" },
    }),
    "—",
  );
});

test("shipmentTariffLabel: uses orderAdapterSellerTitle; null key → default entry", () => {
  const label = shipmentTariffLabel({
    providerKey: "yataxi",
    orderAdapterKey: null,
    selectedOfferServiceName: null,
    carrier: null,
  });
  assert.equal(label, orderAdapterSellerTitle(null));
  assert.equal(label, "Доставка по России");
});

test("shipmentTariffLabel: explicit orderAdapterKey", () => {
  assert.equal(
    shipmentTariffLabel({
      providerKey: "yataxi",
      orderAdapterKey: "yataxi:next_day",
      selectedOfferServiceName: null,
      carrier: null,
    }),
    orderAdapterSellerTitle("yataxi:next_day"),
  );
});

// ── the carrier's own name wins ────────────────────────────────────────────

test("shipmentTariffLabel: CDEK tariff name replaces the registry generalisation", () => {
  // THE DEFECT THIS SLICE FIXES. One cdek:delivery entry stands in front of two
  // dozen tariffs, so the registry title was wrong for every CDEK row.
  const label = shipmentTariffLabel({
    providerKey: "cdek",
    orderAdapterKey: "cdek:delivery",
    selectedOfferServiceName: "Посылка склад-склад",
    carrier: null,
  });
  assert.equal(label, "Посылка склад-склад");
  assert.notEqual(label, orderAdapterSellerTitle("cdek:delivery"));
  assert.notEqual(label, "Доставка по России");
});

test("shipmentTariffLabel: surrounding whitespace is trimmed off the carrier name", () => {
  assert.equal(
    shipmentTariffLabel({
      providerKey: "cdek",
      orderAdapterKey: "cdek:delivery",
      selectedOfferServiceName: "  Экспресс склад-склад  ",
      carrier: null,
    }),
    "Экспресс склад-склад",
  );
});

for (const [label, serviceName] of [
  ["null", null],
  ["undefined", undefined],
  ["an empty string", ""],
  ["whitespace only", "   "],
  ["newlines only", "\n\t "],
]) {
  test(`shipmentTariffLabel: ${label} name → the adapter title`, () => {
    assert.equal(
      shipmentTariffLabel({
        providerKey: "yataxi",
        orderAdapterKey: "yataxi:express",
        selectedOfferServiceName: serviceName,
        carrier: null,
      }),
      orderAdapterSellerTitle("yataxi:express"),
    );
  });
}

test("shipmentTariffLabel: a carrier name BEATS the default-entry fallback on an unknown key", () => {
  // orderAdapterSellerTitle answers an unknown key with the DEFAULT (Yandex)
  // title, so without this precedence a CDEK row whose adapter key drifted
  // would be labelled «Доставка по России» while the true name sat unused.
  const label = shipmentTariffLabel({
    providerKey: "cdek",
    orderAdapterKey: "cdek:nonexistent",
    selectedOfferServiceName: "Посылка склад-склад",
    carrier: null,
  });
  assert.equal(label, "Посылка склад-склад");
  assert.equal(orderAdapterSellerTitle("cdek:nonexistent"), "Доставка по России");
  assert.notEqual(label, orderAdapterSellerTitle("cdek:nonexistent"));
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

test("shipmentLabelCell: Express → unavailable, never a link", () => {
  assert.deepEqual(
    shipmentLabelCell({
      id: "ship-ex",
      status: "CREATED",
      labelUrl: null,
      providerKey: "yataxi",
      orderAdapterKey: "yataxi:express",
    }),
    { kind: "unavailable" },
  );
});

test("shipmentLabelCell: CDEK created → unavailable (no generateLabels yet)", () => {
  assert.deepEqual(
    shipmentLabelCell({
      id: "ship-cdek",
      status: "CREATED",
      labelUrl: null,
      providerKey: "cdek",
      orderAdapterKey: "cdek:delivery",
    }),
    { kind: "unavailable" },
  );
});

test("shipmentLabelCell: draft (null key) → none, not unavailable", () => {
  // A DRAFT has no orderAdapterKey yet (written only on CREATED), so
  // orderAdapterSupportsLabel falls back to the default Yandex entry (true).
  // DRAFT is outside the allow-list → none → «—». This is what the live
  // list shows before a carrier order exists — NOT «Пока недоступна».
  assert.deepEqual(
    shipmentLabelCell({
      id: "ship-draft",
      status: "DRAFT",
      labelUrl: null,
      providerKey: null,
      orderAdapterKey: null,
    }),
    { kind: "none" },
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
