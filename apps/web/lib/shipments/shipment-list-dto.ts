import type { CarrierConfirmWarning } from "@oco/core/carrier-adapter/types";
import type { ShipmentStatus } from "@prisma/client";

/**
 * Browser-facing row from GET /api/shipments.
 * Fields named explicitly — never `{ ...row }` — so Prisma extras cannot leak.
 * confirmWarnings are plain string codes (neutral enum values), never objects.
 */
export type ShipmentListItemDto = {
  id: string;
  createdAt: string;
  status: ShipmentStatus;
  trackNumber: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  recipientName: string;
  destCity: string;
  plannedCost: number | null;
  plannedDeliveryDays: number | null;
  isReturned: boolean;
  isCanceled: boolean;
  returnReason: string | null;
  isAnonymized: boolean;
  providerKey: string | null;
  orderAdapterKey: string | null;
  /**
   * The carrier's own name for the purchased service (CDEK: tariff_name).
   * Null when the carrier gives none — both Yandex families send nothing —
   * and null on rows created before the column existed.
   */
  selectedOfferServiceName: string | null;
  /**
   * Whether an order exists at the carrier — DERIVED from providerOrderId, which
   * itself never crosses the boundary. The browser has no use for an internal
   * carrier id, and shipping one would put a value into the client that only
   * the server should ever hold; the only question the UI actually asks is
   * whether there is something to cancel.
   */
  hasCarrierOrder: boolean;
  confirmWarnings: CarrierConfirmWarning[];
  /**
   * The carrier's real name, RESOLVED ON THE SERVER — the browser only renders
   * it. "" when there is no key to resolve from (a draft with no carrier yet).
   *
   * Replaces the old `carrier: { name }`, which shipped `Carrier.name` — and
   * that column is `providerKey.toUpperCase()`, a key in capital letters rather
   * than a name («CSE», «DOSTAVISTA»).
   */
  carrierName: string;
};

export type ShipmentListItemSource = {
  id: string;
  createdAt: Date;
  status: ShipmentStatus;
  trackNumber: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  recipientName: string;
  destCity: string;
  plannedCost: number | null;
  plannedDeliveryDays: number | null;
  isReturned: boolean;
  isCanceled: boolean;
  returnReason: string | null;
  isAnonymized: boolean;
  providerKey: string | null;
  orderAdapterKey: string | null;
  /**
   * The carrier's own name for the purchased service (CDEK: tariff_name).
   * Null when the carrier gives none — both Yandex families send nothing —
   * and null on rows created before the column existed.
   */
  selectedOfferServiceName: string | null;
  /** Read to derive hasCarrierOrder; never copied to the DTO. */
  providerOrderId: string | null;
  confirmWarnings: readonly CarrierConfirmWarning[];
  /**
   * `apishipCode` — NOT `name`. The legacy table's `name` is the provider key
   * uppercased; its `apishipCode` is the key itself, which is what the resolver
   * needs. Neither ever reaches the browser: the DTO carries the resolved
   * string only.
   */
  carrier: { apishipCode: string } | null;
};

/** Server-side: providerKey → the carrier's real name. */
export type ResolveShipmentCarrierName = (providerKey: string) => string;

export function toShipmentListItem(
  row: ShipmentListItemSource,
  resolveCarrierName: ResolveShipmentCarrierName,
): ShipmentListItemDto {
  // New rows carry providerKey; rows created before that column fall back to
  // the legacy carrier table's apishipCode, which is the same key.
  const providerKeyForName =
    row.providerKey ?? row.carrier?.apishipCode ?? "";
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    status: row.status,
    trackNumber: row.trackNumber,
    trackingUrl: row.trackingUrl,
    labelUrl: row.labelUrl,
    recipientName: row.recipientName,
    destCity: row.destCity,
    plannedCost: row.plannedCost,
    plannedDeliveryDays: row.plannedDeliveryDays,
    isReturned: row.isReturned,
    isCanceled: row.isCanceled,
    returnReason: row.returnReason,
    isAnonymized: row.isAnonymized,
    providerKey: row.providerKey,
    orderAdapterKey: row.orderAdapterKey,
    selectedOfferServiceName: row.selectedOfferServiceName,
    // Same blank-check the cancel route's first precondition uses, so the
    // control and the server agree on what «exists at the carrier» means.
    hasCarrierOrder:
      typeof row.providerOrderId === "string" &&
      row.providerOrderId.trim() !== "",
    confirmWarnings: row.confirmWarnings.map((code) => code),
    carrierName:
      providerKeyForName === "" ? "" : resolveCarrierName(providerKeyForName),
  };
}
