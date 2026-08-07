import type { CarrierConnectField } from "./carrier-connect-fields";

/**
 * Is this carrier's form ready to submit? PURE — descriptors, the current
 * values, and whether the carrier is already connected. The component only
 * calls it, so "when does the button light up" is a decision a millisecond-fast
 * test can reach.
 *
 * `values` holds only what the seller typed into a field they had focused (the
 * panel gates writes through shouldAcceptFieldValue). Part two's POST body MUST
 * read that SAME object — never an input's DOM value, never a ref. Measured:
 * Chrome's autofill can put the seller's own site password into an input and
 * fire a change event, so anything read from the DOM may not be theirs to send.
 *
 * Completeness depends on connection:
 * - Not connected: every field must have a sendable value (first connect).
 * - Connected: at least ONE field must — empty fields keep their stored values
 *   (merge is part two). The UI can mark every field «сохранён» from
 *   `isConnected` alone: connectCarrierCredentials never stores a partial bag.
 *
 * A sendable value:
 * - text or secret: non-blank;
 * - choice: one of ITS OWN options. No default — nothing can tell us which
 *   contract a seller signed, so an unchosen or out-of-set choice does not count.
 */
function isFieldFilled(
  field: CarrierConnectField,
  values: Readonly<Record<string, string>>,
): boolean {
  const raw = Object.prototype.hasOwnProperty.call(values, field.name)
    ? values[field.name]
    : undefined;

  if (typeof raw !== "string" || raw.trim() === "") {
    return false;
  }

  if (field.kind === "choice") {
    return (field.options ?? []).some((option) => option.value === raw);
  }

  return true;
}

export function isCarrierFormComplete(
  fields: readonly CarrierConnectField[],
  values: Readonly<Record<string, string>>,
  isConnected: boolean,
): boolean {
  if (isConnected) {
    return fields.some((field) => isFieldFilled(field, values));
  }
  return fields.every((field) => isFieldFilled(field, values));
}
