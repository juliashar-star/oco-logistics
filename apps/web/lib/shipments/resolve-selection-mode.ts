import type { OfferPriority, PreselectReason } from "./preselect-offer";

export type { OfferPriority };

/**
 * How the seller arrived at the chosen offer, as `Shipment.selectionMode`
 * spells it. Its own four-value union rather than an import of the Prisma enum,
 * for the same compile-time reason `OfferPriority` is one in preselect-offer.ts:
 * the call site assigns this into a Prisma column, so a fifth database value
 * would break the assignment there rather than be swallowed here.
 */
export type SelectionMode = "FAST" | "CHEAP" | "OPTIMAL" | "MANUAL";

export type ResolveSelectionModeInput = {
  reason: unknown;
  priority: unknown;
};

const SELECTION_MODES: ReadonlySet<string> = new Set<SelectionMode>([
  "FAST",
  "CHEAP",
  "OPTIMAL",
  "MANUAL",
]);

/**
 * What a request body said the mode was.
 *
 * `ok: false` is «a value arrived and it is not a mode» — a caller error. It is
 * kept separate from `value: null` because the two callers answer them
 * differently and must be free to: the creation route refuses the request,
 * while the submit route stores null and logs, since by then the carrier order
 * may already exist and the order outranks the report.
 */
export type ParsedSelectionMode =
  | { ok: true; value: SelectionMode | null }
  | { ok: false };

/**
 * THE ONE PARSER, used by every route that reads this field off a request.
 *
 * Blank is legal and means «nobody said» — absent key, null, or empty string.
 * Anything else must be one of the four modes exactly: no trimming, no case
 * folding, no coercion of numbers or objects. Whitespace is therefore rubbish
 * rather than blank, deliberately — treating "   " as blank would let a
 * malformed client write null and have it read later as a determined fact.
 */
export function parseSelectionMode(raw: unknown): ParsedSelectionMode {
  if (raw == null || raw === "") {
    return { ok: true, value: null };
  }
  if (typeof raw === "string" && SELECTION_MODES.has(raw)) {
    return { ok: true, value: raw as SelectionMode };
  }
  return { ok: false };
}

/**
 * Turns the preselect verdict into the mode that gets stored.
 *
 * WHY THIS EXISTS AT ALL. Until 31.08 the form initialised `selectionMode` to
 * "MANUAL" and never changed it on the offers path, so a card placed by the
 * company's rule and a card clicked by a person were written down identically.
 * Three separate roads led to the same "MANUAL" — the initial state, the
 * server's `?? "MANUAL"` default, and a genuine click — and nothing in the
 * database could tell them apart.
 *
 * NULL IS A REAL ANSWER HERE, not a failure. It means «this was not the rule
 * speaking», and the caller decides what that implies. Only the form knows
 * whether a person then clicked, so only the form may write MANUAL.
 *
 * WHY `single` IS NULL AND NOT A MODE. A list of one card is preselected
 * because there is nothing else to choose, whatever the company's priority
 * says — the criterion never ran. Calling that FAST or CHEAP would attribute
 * to a rule an outcome the rule had no part in, and a report counting «orders
 * placed by the fastest-first rule» would silently include lists where no
 * comparison happened. `no_rule` and `not_applicable` are null for the same
 * reason from the other direction: no criterion was applied.
 *
 * WHY `tie` DOES map. A tie means the criterion RAN and several offers were
 * indistinguishable under it. The rule was in force; it merely did not single
 * one out. That is a different fact from «no rule», and the priority is known.
 *
 * OPTIMAL IS UNREACHABLE from here, and deliberately so: `OfferPriority` has
 * two values and neither of them is «optimal». The value stays in the enum for
 * the older APIShip path, which sets it explicitly.
 *
 * NEVER THROWS. The input crosses a network boundary as JSON, so an unknown
 * `reason` or a malformed `priority` is data, not a programming error — it
 * yields null, exactly as «not the rule» does.
 */
export function resolveSelectionModeFromPreselect(
  input: ResolveSelectionModeInput,
): SelectionMode | null {
  if (input.reason !== "rule" && input.reason !== "tie") {
    return null;
  }

  if (input.priority === "FASTEST") {
    return "FAST";
  }
  if (input.priority === "CHEAPEST") {
    return "CHEAP";
  }

  // A rule verdict without a priority cannot say WHICH criterion applied, and
  // guessing one would put a number behind a name nothing measured.
  return null;
}

/**
 * The inverse: which criterion a stored mode implies.
 *
 * WHY THIS IS A FUNCTION AND NOT A COLUMN. `appliedPriority` on the decision
 * record was specified and then withdrawn on 31.08, because it is DERIVED — one
 * substitution away from `selectionMode` — and a stored copy of a derivation can
 * drift from what it was derived from, while a function cannot. There is no
 * information here that `selectionMode` does not already carry.
 *
 * WHEN TO STOP USING IT AND ADD THE COLUMN, stated so the reversal is not a
 * judgement call later: **the moment `SelectionMode` gains a value whose
 * priority cannot be derived.** Today all four map cleanly — two forward, two to
 * null. A fifth that does not would make this function lossy, and a lossy
 * derivation is exactly when the fact has to be written down at the time it was
 * true.
 *
 * MANUAL and OPTIMAL are null for the same reason and it is not «unknown»: the
 * seller departed from the rule, or an older path chose without one. No
 * criterion was applied, so naming one would be an invention.
 *
 * Never throws; an unrecognised mode is null.
 */
export function offerPriorityFromSelectionMode(
  mode: SelectionMode | null | undefined,
): OfferPriority | null {
  if (mode === "FAST") {
    return "FASTEST";
  }
  if (mode === "CHEAP") {
    return "CHEAPEST";
  }
  return null;
}

/**
 * The type-level guard the comments above promise. Unused at runtime; it exists
 * so that adding a value to `OfferPriority` or `PreselectReason` without
 * teaching this module about it fails to compile here.
 */
type _ExhaustivenessGuard = {
  reasons: Record<PreselectReason, true>;
  priorities: Record<OfferPriority, true>;
  modes: Record<SelectionMode, true>;
};
