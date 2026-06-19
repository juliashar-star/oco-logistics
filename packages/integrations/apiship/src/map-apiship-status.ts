import type { ShipmentStatus } from "./types";

const CREATED_KEYS = new Set(["uploading", "uploaded"]);
const IN_TRANSIT_KEYS = new Set(["onWay", "onPointIn", "delivering", "onPointOut"]);
const RETURNED_KEYS = new Set([
  "returned",
  "returning",
  "returnReady",
  "returnedFromDelivery",
  "partialReturn",
]);
const PROBLEM_KEYS = new Set(["uploadingError", "problem", "lost", "unknown"]);

/**
 * Маппинг APIShip status.key → ShipmentStatus OCO.
 * notApplicable и неизвестные ключи → null (статус не менять).
 */
export function mapApishipStatusToShipmentStatus(key: string): ShipmentStatus | null {
  const normalized = key.trim();
  if (!normalized || normalized === "notApplicable") {
    return null;
  }

  if (CREATED_KEYS.has(normalized)) {
    return "CREATED";
  }
  if (IN_TRANSIT_KEYS.has(normalized)) {
    return "IN_TRANSIT";
  }
  if (normalized === "readyForRecipient") {
    return "AT_PVZ";
  }
  if (normalized === "delivered") {
    return "DELIVERED";
  }
  if (RETURNED_KEYS.has(normalized)) {
    return "RETURNED";
  }
  if (normalized === "deliveryCanceled") {
    return "CANCELED";
  }
  if (PROBLEM_KEYS.has(normalized)) {
    return "PROBLEM";
  }

  return null;
}
