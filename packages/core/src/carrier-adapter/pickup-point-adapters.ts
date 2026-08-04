import type { CarrierAdapter } from "./types";
import { listPickupPoints as cdekListPickupPoints } from "./cdek/client";
import { yandexAdapter } from "./yandex/adapter";

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
    providerKey: yandexAdapter.providerKey,
    listPickupPoints: yandexAdapter.listPickupPoints,
  },
  cdek: {
    providerKey: "cdek",
    listPickupPoints: cdekListPickupPoints,
  },
};

/**
 * True only for a non-empty string that is an OWN key of PICKUP_POINT_ADAPTERS.
 * Do NOT use `key in PICKUP_POINT_ADAPTERS`: `in` walks the prototype chain, so
 * user-controlled strings like "toString" / "constructor" / "__proto__" would
 * pass and get stored. hasOwnProperty.call refuses those.
 */
export function isKnownPickupPointProviderKey(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Object.prototype.hasOwnProperty.call(PICKUP_POINT_ADAPTERS, value)
  );
}

export function getPickupPointAdapter(
  providerKey: string,
): PickupPointAdapter | undefined {
  return PICKUP_POINT_ADAPTERS[providerKey];
}
