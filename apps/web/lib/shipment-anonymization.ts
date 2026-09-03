/**
 * ONE list of the Shipment columns anonymisation must clear, and what each is
 * cleared with.
 *
 * WHY THIS FILE EXISTS. There used to be two hand-written lists: the one in
 * `recipient-pii.ts` that decides what gets ENCRYPTED, and the one spelled out
 * inline in the anonymise route that decides what gets CLEARED. Five fields
 * were encrypted and three were cleared, so `destApartment` and
 * `deliveryComment` survived anonymisation as encrypted personal data. Two
 * hand-written lists diverge; that is what hand-written lists do. This is the
 * second one, and the route now reads it instead of naming fields itself.
 *
 * The guard that keeps the two honest is `tests/shipment-anonymization.test.mjs`.
 * It derives the encrypted set from what `encryptShipmentRecipientFields`
 * actually RETURNS and asserts each of those names is a KEY here — key
 * presence, not the resolved value, because `null` is a legitimate replacement
 * and a truthiness check would let a missing key pass.
 */

/** Marker written into columns that cannot be null. Seller-facing. */
export const ANONYMIZED_TEXT = "УДАЛЕНО";

/**
 * Field → what replaces it.
 *
 * `"УДАЛЕНО"` where the column is NOT NULL in the schema (`recipientName`,
 * `recipientPhone`, `destCity`) — null is not available there. `destAddress` is
 * nullable but takes the marker too: that is what the route already wrote, and
 * this slice moves the list, it does not redecide its contents.
 *
 * `null` for `destApartment`, `deliveryComment` and `pvzCode`. All three are
 * nullable and never carried a marker; writing «УДАЛЕНО» into an apartment
 * number or a courier note would invent a value where the honest state is
 * absence.
 */
export const ANONYMIZED_SHIPMENT_FIELDS = Object.freeze({
  recipientName: ANONYMIZED_TEXT,
  recipientPhone: ANONYMIZED_TEXT,
  destAddress: ANONYMIZED_TEXT,
  destApartment: null,
  deliveryComment: null,
  destCity: ANONYMIZED_TEXT,
  pvzCode: null,
}) satisfies Record<string, string | null>;

export type AnonymizedShipmentField = keyof typeof ANONYMIZED_SHIPMENT_FIELDS;

/**
 * The `data` payload for the Shipment update, list plus the flag.
 *
 * A function rather than a second constant so the caller cannot mutate the
 * frozen list by spreading into it, and so `isAnonymized` travels with the
 * fields it describes instead of being remembered separately at the call site.
 */
export function anonymizedShipmentUpdate(): typeof ANONYMIZED_SHIPMENT_FIELDS & {
  isAnonymized: true;
} {
  return { ...ANONYMIZED_SHIPMENT_FIELDS, isAnonymized: true };
}
