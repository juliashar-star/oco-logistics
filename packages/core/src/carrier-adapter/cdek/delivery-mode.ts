/**
 * CDEK packs BOTH ends of the journey into one delivery_mode code — unlike
 * Yandex, whose departure point is fixed by the credentials (platform
 * station) so only the destination side varies. Here:
 *   - handoverMode chooses the FIRST mile (seller → carrier): DROP_OFF =
 *     seller brings the parcel to a CDEK warehouse; COURIER = CDEK collects
 *     at the seller's door;
 *   - pickupType chooses the LAST mile (carrier → recipient): PVZ =
 *     warehouse/pickup point; COURIER = door delivery.
 * Numbers are CDEK's own (1 дверь-дверь … 4 склад-склад).
 */
export function cdekDeliveryMode(
  handoverMode: "COURIER" | "DROP_OFF" | undefined,
  pickupType: "PVZ" | "COURIER",
): number {
  // Column default and the cheaper branch when the field is absent.
  const handover = handoverMode ?? "DROP_OFF";

  if (handover === "DROP_OFF" && pickupType === "PVZ") return 4; // склад-склад
  if (handover === "DROP_OFF" && pickupType === "COURIER") return 3; // склад-дверь
  if (handover === "COURIER" && pickupType === "PVZ") return 2; // дверь-склад
  return 1; // дверь-дверь (COURIER + COURIER)
}
