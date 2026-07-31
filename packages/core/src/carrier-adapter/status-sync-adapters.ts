import type { ShipmentStatus } from "@oco/apiship";
import type { CarrierAdapter } from "./types";
import { DEFAULT_ORDER_ADAPTER, ORDER_ADAPTERS } from "./order-adapters";
import { yandexAdapter } from "./yandex/adapter";
import {
  getExpressOrderHistory,
  getExpressOrderInfo,
} from "./yandex/express-client";
import { mapClaimStatusToShipmentStatus } from "./yandex/map-claim-status";
import { mapYandexStatusToShipmentStatus } from "./yandex/map-status";

/**
 * Status-sync capability only — not a full CarrierAdapter.
 * Call sites that need history/info + status mapping resolve by
 * orderAdapterKey here instead of hardcoding a carrier module.
 * providerKey stays on the entry: credentials are per carrier, and several
 * services can share one CarrierCredential row.
 *
 * mapStatus lives on the bundle (not CarrierAdapter): the adapter contract is
 * about API calls; status mapping is a pure per-carrier function the neutral
 * layer needs, and the pickup-point registry already set the precedent that a
 * bundle may pick and mix.
 */
export type StatusSyncAdapter = {
  orderAdapterKey: string;
  providerKey: string;
  getOrderHistory: CarrierAdapter["getOrderHistory"];
  getOrderInfo: CarrierAdapter["getOrderInfo"];
  mapStatus: (statusCode: string) => ShipmentStatus | null;
};

export const STATUS_SYNC_ADAPTERS: Record<string, StatusSyncAdapter> = {
  "yataxi:next_day": {
    orderAdapterKey: DEFAULT_ORDER_ADAPTER.key,
    providerKey: DEFAULT_ORDER_ADAPTER.providerKey,
    getOrderHistory: yandexAdapter.getOrderHistory,
    getOrderInfo: yandexAdapter.getOrderInfo,
    mapStatus: mapYandexStatusToShipmentStatus,
  },
  "yataxi:express": {
    orderAdapterKey: ORDER_ADAPTERS["yataxi:express"].key,
    providerKey: ORDER_ADAPTERS["yataxi:express"].providerKey,
    getOrderHistory: getExpressOrderHistory,
    getOrderInfo: getExpressOrderInfo,
    mapStatus: mapClaimStatusToShipmentStatus,
  },
  "yataxi:courier": {
    orderAdapterKey: ORDER_ADAPTERS["yataxi:courier"].key,
    providerKey: ORDER_ADAPTERS["yataxi:courier"].providerKey,
    getOrderHistory: getExpressOrderHistory,
    getOrderInfo: getExpressOrderInfo,
    mapStatus: mapClaimStatusToShipmentStatus,
  },
};
