import type { CarrierConnectField } from "./carrier-connect-fields";

/**
 * WHAT IS STILL MISSING before this carrier's form can be submitted — the same
 * question `isCarrierFormComplete` answers, but naming the answer instead of
 * reducing it to a boolean.
 *
 * THE ONE PLACE that decides completeness. `isCarrierFormComplete` is DERIVED
 * from this function and holds no second implementation: a button that lights up
 * while the notice beside it still lists a missing field is worse than the
 * silent grey button this replaces, and two independent implementations produce
 * exactly that. The drift is impossible, not merely tested — the same reason
 * `carrier-connect-fields.ts` derives its descriptors rather than re-listing
 * them.
 *
 * `values` holds only what the seller typed into a field they had focused (the
 * panel gates writes through shouldAcceptFieldValue). Measured: Chrome's
 * autofill can put the seller's own site password into an input and fire a
 * change event, so anything read from the DOM may not be theirs to send. This
 * function reads `values` and nothing else.
 *
 * TWO MEANINGS, NOT FIVE. Five situations make a field unusable — no key in
 * `values`, a value that is not a string, a blank or whitespace-only string, a
 * choice outside its own options, and a choice field with no options at all —
 * but they carry only two meanings for a seller: the field is EMPTY, or the
 * CHOSEN OPTION is not one we can send. The first three already collapse into a
 * single test below and are reported together; splitting them on screen would
 * name an implementation detail, not something a seller can act on.
 *
 * Completeness depends on connection, and the two branches differ in KIND, not
 * only in strictness:
 * - Not connected: every field must have a sendable value (first connect), so
 *   the gap is a LIST and each entry can be named.
 * - Connected: at least ONE field must — empty fields keep their stored values
 *   (merge is part two). Refusal here means NOT ONE field is usable, so no
 *   single field can be named: filling any one of them clears it. That is why
 *   `nothing_supplied` carries no fields, and why `missing` can only arise on a
 *   carrier that is not yet connected.
 *
 * A KNOWN IMPRECISION, in a corner the UI cannot reach. A connected carrier
 * whose only supplied value is a choice outside its options reports
 * `nothing_supplied` rather than naming the bad choice. Through the interface
 * that state is unreachable: choice values come from buttons whose `value` is
 * taken from `field.options` itself. It is reachable only by a stale bundle in
 * an open tab or by tampering, and the wording stays honest there — nothing
 * usable was supplied.
 */

export type CarrierFormGap =
  /** Nothing is missing. The button may be enabled. */
  | { kind: "ready" }
  /**
   * There are no fields to fill at all. Never a seller's state: a carrier entry
   * with an empty credential list is a configuration error on our side. Not
   * ready, so the button stays disabled — and nothing to say to the seller,
   * who can fix none of it.
   */
  | { kind: "no_fields" }
  /**
   * Connected carrier, and not one field carries a sendable value. Names no
   * field on purpose — see above.
   */
  | { kind: "nothing_supplied" }
  /**
   * Not-connected carrier with a nameable gap. At least one of the two arrays
   * is non-empty; a field appears in at most one of them, because the blank
   * test runs first and a value that fails it never reaches the choice test.
   * Both preserve the order of `fields`, which is the order the seller sees on
   * screen — never sorted.
   */
  | {
      kind: "missing";
      /** Empty: no value, not a string, or blank after trimming. */
      blank: readonly CarrierConnectField[];
      /** Non-empty value that is not one of this field's own options. */
      badChoice: readonly CarrierConnectField[];
    };

type FieldVerdict = "filled" | "blank" | "badChoice";

/**
 * The per-field test, unchanged in behaviour from the boolean it replaces —
 * only its verdict got wider. A sendable value:
 * - text or secret: non-blank;
 * - choice: one of ITS OWN options. No default — nothing can tell us which
 *   contract a seller signed, so an unchosen or out-of-set choice does not count.
 */
function classifyField(
  field: CarrierConnectField,
  values: Readonly<Record<string, string>>,
): FieldVerdict {
  // Own-property only: a field named "__proto__" or "toString" must not resolve
  // through the prototype chain and read as filled.
  const raw = Object.prototype.hasOwnProperty.call(values, field.name)
    ? values[field.name]
    : undefined;

  if (typeof raw !== "string" || raw.trim() === "") {
    return "blank";
  }

  if (field.kind === "choice") {
    return (field.options ?? []).some((option) => option.value === raw)
      ? "filled"
      : "badChoice";
  }

  return "filled";
}

export function describeCarrierFormGap(
  fields: readonly CarrierConnectField[],
  values: Readonly<Record<string, string>>,
  isConnected: boolean,
): CarrierFormGap {
  // AN EMPTY FIELD LIST IS NEVER READY, in either connection state, and it is
  // checked first so neither branch below ever sees one. `every` over an empty
  // list is vacuously true: the not-connected branch reported `ready`, which lit
  // «Подключить» on a card with nothing in it and would have sent a POST with no
  // credentials at all.
  //
  // WHY A KIND OF ITS OWN and not `nothing_supplied`, which the connected branch
  // already returned for an empty list. `carrierFormGapMessage` documents that
  // `nothing_supplied` only happens on a carrier that is already connected, and
  // answers it with «Чтобы сохранить…». Reused here, that invariant would stop
  // being true, and a not-connected card whose button says «Подключить» would be
  // told to «сохранить». An empty list is not a seller's gap at all — it is a
  // configuration error on our side — and it gets a name that says so.
  if (fields.length === 0) {
    return { kind: "no_fields" };
  }

  const blank: CarrierConnectField[] = [];
  const badChoice: CarrierConnectField[] = [];
  let filledCount = 0;

  for (const field of fields) {
    switch (classifyField(field, values)) {
      case "filled":
        filledCount += 1;
        break;
      case "blank":
        blank.push(field);
        break;
      case "badChoice":
        badChoice.push(field);
        break;
    }
  }

  if (isConnected) {
    return filledCount > 0 ? { kind: "ready" } : { kind: "nothing_supplied" };
  }

  if (blank.length === 0 && badChoice.length === 0) {
    return { kind: "ready" };
  }

  return { kind: "missing", blank, badChoice };
}
