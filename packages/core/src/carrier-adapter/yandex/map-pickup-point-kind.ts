import type { CarrierPickupPointKind } from "../types";

/**
 * Yandex pickup-points/list `type` → neutral CarrierPickupPointKind.
 * Unknown / blank → "unknown" (do not throw — a new venue kind must not
 * break the whole list).
 */
export function mapYandexPickupPointTypeToKind(
  type: string,
): CarrierPickupPointKind {
  const normalized = type.trim();
  if (normalized === "pickup_point") {
    return "pickup_point";
  }
  if (normalized === "terminal") {
    return "postamat";
  }
  if (normalized === "warehouse") {
    return "warehouse";
  }
  return "unknown";
}
