import type { ShipmentStatus } from "@oco/apiship";
import type { CarrierAdapter } from "./types";
import { yandexAdapter } from "./yandex/adapter";
import { mapYandexStatusToShipmentStatus } from "./yandex/map-status";

/**
 * Status-sync capability only — not a full CarrierAdapter.
 * Call sites that need history/info + status mapping resolve by providerKey
 * here instead of hardcoding a carrier module.
 *
 * mapStatus lives on the bundle (not CarrierAdapter): the adapter contract is
 * about API calls; status mapping is a pure per-carrier function the neutral
 * layer needs, and the pickup-point registry already set the precedent that a
 * bundle may pick and mix.
 */
export type StatusSyncAdapter = {
  providerKey: string;
  getOrderHistory: CarrierAdapter["getOrderHistory"];
  getOrderInfo: CarrierAdapter["getOrderInfo"];
  mapStatus: (statusCode: string) => ShipmentStatus | null;
};

export const STATUS_SYNC_ADAPTERS: Record<string, StatusSyncAdapter> = {
  yataxi: {
    providerKey: yandexAdapter.providerKey,
    getOrderHistory: yandexAdapter.getOrderHistory,
    getOrderInfo: yandexAdapter.getOrderInfo,
    mapStatus: mapYandexStatusToShipmentStatus,
  },
};

export function getStatusSyncAdapter(
  providerKey: string,
): StatusSyncAdapter | undefined {
  return STATUS_SYNC_ADAPTERS[providerKey];
}
