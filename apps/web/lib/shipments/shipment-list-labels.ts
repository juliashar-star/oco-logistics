import { orderAdapterSellerTitle } from "@oco/core/carrier-adapter/order-adapter-seller-titles";
import {
  isLabelAllowedStatus,
  orderAdapterSupportsLabel,
} from "@oco/core/carrier-adapter/order-adapter-label-support";
import { providerSellerDisplayName } from "@oco/core/carrier-adapter/provider-seller-display-names";
import { isHttpOrHttpsUrl } from "../url/is-http-or-https-url";

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

export type ShipmentLabelCellRow = {
  id: string;
  status: string;
  labelUrl: string | null;
  providerKey: string | null;
  orderAdapterKey: string | null;
};

export type ShipmentLabelCellDecision =
  | { kind: "external"; href: string }
  | { kind: "download"; href: string }
  | { kind: "not_required" }
  | { kind: "none" };

/**
 * ЭТИКЕТКА cell decision — pure, client-safe.
 *
 * providerKey non-null is the client-side proxy for «has a carrier order»
 * (measured: CREATED rows line up providerKey ↔ providerOrderId with no
 * cross cells). Must not import order-adapters.
 */
export function shipmentLabelCell(
  row: ShipmentLabelCellRow,
): ShipmentLabelCellDecision {
  const statusAllowed = isLabelAllowedStatus(row.status);
  const legacyUrl =
    row.labelUrl != null && isHttpOrHttpsUrl(row.labelUrl) ? row.labelUrl : null;

  if (legacyUrl != null && statusAllowed) {
    return { kind: "external", href: legacyUrl };
  }

  const hasCarrierOrder = row.providerKey != null;
  const supportsLabel = orderAdapterSupportsLabel(row.orderAdapterKey);

  if (hasCarrierOrder && supportsLabel && statusAllowed) {
    return {
      kind: "download",
      href: `/api/shipments/${row.id}/label`,
    };
  }

  if (!supportsLabel) {
    return { kind: "not_required" };
  }

  return { kind: "none" };
}
