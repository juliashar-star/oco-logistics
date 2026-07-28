import type { CarrierPickupPointKind } from "@oco/core/carrier-adapter/types";

/**
 * Seller-facing <option> label for a pickup point.
 * Постамат / склад get an explicit prefix; plain pickup_point (and unknown)
 * keep «name — address» unchanged.
 */
export function formatPickupPointOptionLabel(point: {
  kind: CarrierPickupPointKind;
  name: string;
  address: string;
}): string {
  const base = `${point.name} — ${point.address}`;
  if (point.kind === "postamat") {
    return `Постамат — ${base}`;
  }
  if (point.kind === "warehouse") {
    return `Склад — ${base}`;
  }
  return base;
}
