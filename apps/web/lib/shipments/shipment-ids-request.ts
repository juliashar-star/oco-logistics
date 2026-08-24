/**
 * The shape every bulk action over selected shipments speaks: `{ shipmentIds }`.
 *
 * Extracted from the handover-act route so the act, bulk delete and bulk export
 * parse the SAME body the same way. A second parser would drift — one of them
 * would learn to accept a bare array, or to tolerate a number in the list, and
 * the difference would only surface as a strange 500 in whichever route was
 * forgotten.
 */
export function parseShipmentIds(body: unknown): string[] | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const raw = (body as { shipmentIds?: unknown }).shipmentIds;
  if (!Array.isArray(raw)) {
    return null;
  }
  if (!raw.every((id) => typeof id === "string")) {
    return null;
  }
  return raw;
}

/**
 * Trim, drop blanks, drop duplicates — in that order.
 *
 * Deduplication is not tidiness: a repeated id would be counted twice against
 * the selection limit, and on a document it would print the same parcel twice.
 * Blank entries are dropped rather than refused because an empty string is a
 * selection that carries no shipment, not a malformed request.
 */
export function normalizeShipmentIds(shipmentIds: readonly string[]): string[] {
  return [
    ...new Set(shipmentIds.map((id) => id.trim()).filter((id) => id.length > 0)),
  ];
}

/**
 * Max shipments one bulk action may touch.
 *
 * DELIBERATELY A SEPARATE CONSTANT from HANDOVER_ACT_SELECTION_LIMIT even though
 * both are 100 today. The act's cap is about a signed document a human has to
 * read before signing; this one is about a selection made with checkboxes over
 * a page of 50 rows, where the risk is an accidental «select all» twice over.
 * Same number, different reasons — merging them would mean a later change to
 * one silently moves the other.
 */
export const BULK_SELECTION_LIMIT = 100;
