import type { ShipmentStatus } from "@oco/apiship";

/** Pre-network paperwork / CDEK's own CREATED and ACCEPTED. */
const CREATED_KEYS = new Set(["ACCEPTED", "CREATED"]);

/**
 * POSTOMAT_SEIZED is «изъят из постамата КУРЬЕРОМ» — the parcel went back into
 * the network, so IN_TRANSIT; POSTOMAT_RECEIVED is «изъят КЛИЕНТОМ» — that is
 * DELIVERED. One word apart, opposite meanings.
 */
const IN_TRANSIT_KEYS = new Set([
  "RECEIVED_AT_SHIPMENT_WAREHOUSE",
  "READY_FOR_SHIPMENT_IN_SENDER_CITY",
  "TAKEN_BY_TRANSPORTER_FROM_SENDER_CITY",
  "SENT_TO_RECIPIENT_CITY",
  "ACCEPTED_IN_RECIPIENT_CITY",
  "ACCEPTED_AT_RECIPIENT_CITY_WAREHOUSE",
  "TAKEN_BY_COURIER",
  "ACCEPTED_AT_TRANSIT_WAREHOUSE",
  "READY_FOR_SHIPMENT_IN_TRANSIT_CITY",
  "TAKEN_BY_TRANSPORTER_FROM_TRANSIT_CITY",
  "SENT_TO_TRANSIT_CITY",
  "ACCEPTED_IN_TRANSIT_CITY",
  "SENT_TO_SENDER_CITY",
  "ACCEPTED_IN_SENDER_CITY",
  "ENTERED_TO_TRANSIT_WAREHOUSE",
  "ENTERED_TO_RECIPIENT_CITY_WAREHOUSE",
  "IN_CUSTOMS_INTERNATIONAL",
  "SHIPPED_TO_DESTINATION",
  "PASSED_TO_TRANSIT_CARRIER",
  "IN_CUSTOMS_LOCAL",
  "CUSTOMS_COMPLETE",
  "POSTOMAT_SEIZED",
]);

const AT_PVZ_KEYS = new Set([
  "ACCEPTED_AT_PICK_UP_POINT",
  "ENTERED_TO_PICK_UP_POINT",
  "POSTOMAT_POSTED",
]);

/** POSTOMAT_RECEIVED — client took the parcel from the postomat. */
const DELIVERED_KEYS = new Set(["DELIVERED", "POSTOMAT_RECEIVED"]);

/**
 * NOT_DELIVERED («Не вручен») is RETURNED, not PROBLEM: it is the moment a
 * return begins. Both Yandex and APIShip already map the whole return journey
 * to RETURNED, and the reason belongs in the «Причина» column, not in the
 * status.
 *
 * RETURNED is terminal, so a shipment leaves the sync candidate set once it is
 * set. That is already true for Yandex and APIShip; we accept it for
 * consistency rather than inventing a CDEK-only rule.
 */
const RETURNED_KEYS = new Set([
  "NOT_DELIVERED",
  "RETURNED_TO_SENDER_CITY_WAREHOUSE",
  "RETURNED_TO_TRANSIT_WAREHOUSE",
  "RETURNED_TO_RECIPIENT_CITY_WAREHOUSE",
]);

const CANCELED_KEYS = new Set(["REMOVED"]);

const PROBLEM_KEYS = new Set(["INVALID"]);

/**
 * Маппинг CDEK order status code → ShipmentStatus OCO.
 * Table = CDEK OpenAPI «Приложение 1. Статусы заказов», verbatim.
 * Unknown / blank / non-string → null (статус не менять), same contract as
 * mapYandexStatusToShipmentStatus. Trims; does not case-fold (mirror Yandex).
 */
export function mapCdekStatusToShipmentStatus(
  statusCode: string,
): ShipmentStatus | null {
  if (typeof statusCode !== "string") {
    return null;
  }

  const normalized = statusCode.trim();
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
