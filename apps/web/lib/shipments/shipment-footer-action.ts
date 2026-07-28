export type ShipmentFooterAction = "delete" | "anonymize" | "none";

/**
 * Which destructive footer action the shipment drawer offers.
 * DRAFT → delete (even if already anonymised); else anonymize if still has PII.
 */
export function shipmentFooterAction(shipment: {
  status: string;
  isAnonymized: boolean;
}): ShipmentFooterAction {
  if (shipment.status === "DRAFT") return "delete";
  if (!shipment.isAnonymized) return "anonymize";
  return "none";
}
