import { orderAdapterSellerTitle } from "@oco/core/carrier-adapter/order-adapter-seller-titles";
import { providerSellerDisplayName } from "@oco/core/carrier-adapter/provider-seller-display-names";

export type ShipmentListLabelRow = {
  providerKey: string | null;
  orderAdapterKey: string | null;
  carrier: { name: string } | null;
};

/**
 * ПЕРЕВОЗЧИК cell / CSV «Перевозчик».
 * Masked names come from provider-seller-display-names (one place).
 */
export function shipmentCarrierLabel(row: ShipmentListLabelRow): string {
  if (row.providerKey != null) {
    return providerSellerDisplayName(row.providerKey) ?? "—";
  }
  return row.carrier?.name ?? "—";
}

/**
 * ТАРИФ cell / CSV «Тариф».
 * Titles from order-adapter-seller-titles (null/unknown key → default entry).
 * Must not import order-adapters — that registry pulls Node builtins into the client.
 */
export function shipmentTariffLabel(row: ShipmentListLabelRow): string {
  if (row.providerKey == null) {
    return "—";
  }
  return orderAdapterSellerTitle(row.orderAdapterKey);
}
