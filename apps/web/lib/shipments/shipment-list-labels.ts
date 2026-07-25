import { resolveOrderAdapter } from "@oco/core/carrier-adapter/order-adapters";
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
 * Uses OrderAdapter.title via resolveOrderAdapter (null/unknown key → default entry).
 */
export function shipmentTariffLabel(row: ShipmentListLabelRow): string {
  if (row.providerKey == null) {
    return "—";
  }
  return resolveOrderAdapter(row.orderAdapterKey).title;
}
