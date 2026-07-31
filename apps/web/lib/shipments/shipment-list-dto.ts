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
    confirmWarnings: row.confirmWarnings.map((code) => code),
    carrier: row.carrier ? { name: row.carrier.name } : null,
  };
}
