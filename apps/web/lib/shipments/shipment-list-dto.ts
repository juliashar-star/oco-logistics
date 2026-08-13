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
   * Whether an order exists at the carrier — DERIVED from providerOrderId, which
   * itself never crosses the boundary. The browser has no use for an internal
   * carrier id, and shipping one would put a value into the client that only
   * the server should ever hold; the only question the UI actually asks is
   * whether there is something to cancel.
   */
  hasCarrierOrder: boolean;
  confirmWarnings: CarrierConfirmWarning[];
  carrier: { name: string } | null;
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
  /** Read to derive hasCarrierOrder; never copied to the DTO. */
  providerOrderId: string | null;
  confirmWarnings: readonly CarrierConfirmWarning[];
  carrier: { name: string } | null;
};

export function toShipmentListItem(
  row: ShipmentListItemSource,
): ShipmentListItemDto {
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
    // Same blank-check the cancel route's first precondition uses, so the
    // control and the server agree on what «exists at the carrier» means.
    hasCarrierOrder:
      typeof row.providerOrderId === "string" &&
      row.providerOrderId.trim() !== "",
    confirmWarnings: row.confirmWarnings.map((code) => code),
    carrier: row.carrier ? { name: row.carrier.name } : null,
  };
}
