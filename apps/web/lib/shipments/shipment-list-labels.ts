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
  /** The carrier's own name for the purchased service; null when it gave none. */
  selectedOfferServiceName: string | null;
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
 * ТАРИФ cell / CSV «Тариф» / drawer «Тариф» — one resolver for all three.
 *
 * THE CARRIER'S OWN NAME WINS WHENEVER THERE IS ONE, and the asymmetry between
 * carriers is the reason. For Yandex the registry entry IS the service —
 * `yataxi:next_day` is one service, so its title is correct and the carrier
 * sends no name of its own. For CDEK a single `cdek:delivery` entry stands in
 * front of two dozen tariffs (24 measured on one route), so the registry title
 * is a generalisation that is wrong for every row: the seller picked «Посылка
 * склад-склад» and was shown «Доставка по России».
 *
 * The registry title stays the fallback, not the default: rows created before
 * the column existed, and carriers that name nothing, still need a label.
 *
 * Titles from order-adapter-seller-titles (null/unknown key → default entry).
 * Must not import order-adapters — that registry pulls Node builtins into the client.
 */
export function shipmentTariffLabel(row: ShipmentListLabelRow): string {
  if (row.providerKey == null) {
    return "—";
  }
  const carrierName = row.selectedOfferServiceName?.trim() ?? "";
  if (carrierName !== "") {
    return carrierName;
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
  | { kind: "unavailable" }
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

  // Adapter has no generateLabels yet (Express, courier, CDEK). We do not know
  // whether the carrier NEEDS a printed form — only that we do not produce one.
  // «unavailable», not «not_required»: the latter name would re-assert the very
  // claim the seller-facing string was changed to withdraw. See ADR 2026-08-05.
  if (!supportsLabel) {
    return { kind: "unavailable" };
  }

  return { kind: "none" };
}
