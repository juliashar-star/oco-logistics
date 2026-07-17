import type { ShipmentStatus } from "@oco/apiship";

/** Pre-network paperwork / track setup, plus Yandex's own CREATED. */
const CREATED_KEYS = new Set([
  "VALIDATING",
  "DELIVERY_PROCESSING_STARTED",
  "DELIVERY_TRACK_RECIEVED", // Yandex spelling: RECIEVED, not RECEIVED
  "SORTING_CENTER_PROCESSING_STARTED",
  "SORTING_CENTER_TRACK_RECEIVED",
  "SORTING_CENTER_TRACK_LOADED",
  "DELIVERY_LOADED",
  "SORTING_CENTER_LOADED",
  "CREATED",
]);

/**
 * SORTING_CENTER_AT_START ("Заказ поступил в точку приема") is where the parcel
 * physically enters the network — everything before it is paperwork.
 * DELIVERY_ATTEMPT_FAILED is IN_TRANSIT, not PROBLEM: Yandex retries twice more,
 * so the parcel is still moving; the detail belongs in the TrackingEvent row,
 * not in a coarse status.
 */
const IN_TRANSIT_KEYS = new Set([
  "SORTING_CENTER_AT_START",
  "SORTING_CENTER_PREPARED",
  "SORTING_CENTER_TRANSMITTED",
  "DELIVERY_AT_START",
  "DELIVERY_AT_START_SORT",
  "DELIVERY_TRANSPORTATION",
  "DELIVERY_TRANSPORTATION_RECIPIENT",
  "DELIVERY_ATTEMPT_FAILED",
]);

const AT_PVZ_KEYS = new Set(["DELIVERY_ARRIVED_PICKUP_POINT"]);

/**
 * DELIVERY_TRANSMITTED_TO_RECIPIENT ("выдан получателю") and DELIVERY_DELIVERED
 * ("вручен клиенту") are different Yandex statuses that both mean "доставлено"
 * to a seller. PARTICULARLY_DELIVERED is частичный выкуп — part delivered, part
 * returning — which our 8 statuses cannot express; DELIVERED is the closest
 * honest answer and the event row carries the truth.
 */
const DELIVERED_KEYS = new Set([
  "DELIVERY_TRANSMITTED_TO_RECIPIENT",
  "DELIVERY_DELIVERED",
  "PARTICULARLY_DELIVERED",
]);

/** Every return-ish key → RETURNED, same as map-apiship-status for returning/returnReady/partialReturn. */
const RETURNED_KEYS = new Set([
  "SORTING_CENTER_RETURN_PREPARING",
  "SORTING_CENTER_RETURN_PREPARING_SENDER",
  "SORTING_CENTER_RETURN_ARRIVED",
  "SORTING_CENTER_RETURN_RETURNED",
  "RETURN_PREPARING",
  "RETURN_TRANSPORTATION_STARTED",
  "RETURN_ARRIVED_DELIVERY",
  "RETURN_TRANSMITTED_FULFILMENT",
  "RETURN_READY_FOR_PICKUP",
  "RETURN_RETURNED",
]);

/**
 * Yandex spells CANCELLED with TWO Ls; ours is CANCELED (one L).
 * A copy-paste of our enum name would never match and the status would
 * silently never update.
 */
const CANCELED_KEYS = new Set(["CANCELLED"]);

/** VALIDATING_ERROR — "Заказ не подтвержден в сортировочном центре". */
const PROBLEM_KEYS = new Set(["VALIDATING_ERROR"]);

/**
 * Маппинг Yandex state.status → ShipmentStatus OCO.
 * Unknown keys → null (статус не менять), same contract as mapApishipStatusToShipmentStatus.
 *
 * Deliberately NOT mapped (→ null):
 * - "DRAFT" — Yandex's OWN DRAFT means "заказ создан" pre-confirm. Mapping it to
 *   OUR DRAFT would roll back a row that already HAS an order at Yandex, making
 *   it re-quotable and re-submittable — a duplicate order straight through the
 *   three-tier guard. This is the most dangerous line in the file.
 * - DELIVERY_STORAGE_PERIOD_EXPIRED, CONFIRMATION_CODE_RECEIVED — parcel still
 *   at the point; the RETURN_* chain drives what happens next.
 * - DELIVERY_TIME_INTERVALS_UPDATED — a reschedule, not a status change. Means
 *   plannedDeliveryDate is now STALE and only request/info carries the new
 *   interval; handling that is a separate slice.
 */
export function mapYandexStatusToShipmentStatus(
  status: string,
): ShipmentStatus | null {
  const normalized = status.trim();
  if (!normalized) {
    return null;
  }

  if (CREATED_KEYS.has(normalized)) {
    return "CREATED";
  }
  if (IN_TRANSIT_KEYS.has(normalized)) {
    return "IN_TRANSIT";
  }
  if (AT_PVZ_KEYS.has(normalized)) {
    return "AT_PVZ";
  }
  if (DELIVERED_KEYS.has(normalized)) {
    return "DELIVERED";
  }
  if (RETURNED_KEYS.has(normalized)) {
    return "RETURNED";
  }
  if (CANCELED_KEYS.has(normalized)) {
    return "CANCELED";
  }
  if (PROBLEM_KEYS.has(normalized)) {
    return "PROBLEM";
  }

  return null;
}
