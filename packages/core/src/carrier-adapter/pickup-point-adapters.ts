import type { CarrierAdapter } from "./types";
import { listPickupPoints as yandexListPickupPoints } from "./yandex/client";

/**
 * Pickup-point capability only — not a full CarrierAdapter.
 * Call sites that need listPickupPoints resolve by providerKey here
 * instead of hardcoding a carrier module.
 */
export type PickupPointAdapter = {
  providerKey: string;
  listPickupPoints: CarrierAdapter["listPickupPoints"];
};

export const PICKUP_POINT_ADAPTERS: Record<string, PickupPointAdapter> = {
  yataxi: {
    providerKey: "yataxi",
    listPickupPoints: yandexListPickupPoints,
  },
};

export function getPickupPointAdapter(
  providerKey: string,
): PickupPointAdapter | undefined {
  return PICKUP_POINT_ADAPTERS[providerKey];
}
