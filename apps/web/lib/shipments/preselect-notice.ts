import type { OfferPriority, PreselectReason } from "./preselect-offer";

/** The three states of the settings control. «Nothing» is the NULL column. */
export const OFFER_PRIORITY_LEGEND_RU = "Что подставлять в новом заказе";
export const OFFER_PRIORITY_NONE_RU = "Ничего не подставлять";
export const OFFER_PRIORITY_CHEAPEST_RU = "Самый дешёвый вариант";
export const OFFER_PRIORITY_FASTEST_RU = "Самый быстрый вариант";

/**
 * Said under the control, because the setting is worth nothing to a seller who
 * fears it will lock them in. It states the exact scope of a departure: this
 * order, and the setting is untouched.
 */
export const OFFER_PRIORITY_HINT_RU =
  "Подставленный вариант можно заменить в любом заказе — настройка от этого не изменится.";

/**
 * The line beside the offer list, or null when nothing is to be said.
 *
 * «ИЗ ПОКАЗАННЫХ» IS LOAD-BEARING, not filler. A pickup point narrows the list
 * to the carrier that owns it, so the set the rule chose from can be one
 * carrier's tariffs or a single option. «Самый дешёвый» on its own would be a
 * claim about the market; «самый дешёвый из показанных» is true of every list
 * the seller can actually see, however it was narrowed.
 *
 * THREE REASONS SAY NOTHING, each for its own reason. `no_rule`: the seller set
 * no priority, so there is nothing to explain. `single`: one offer, no
 * comparison happened, and a comparative sentence about a list of one would be
 * decoration. `not_applicable`: a priority is set but the criterion could not
 * be applied — and the tie wording would be false here, since nothing tied.
 * That last one is the reason `not_applicable` is a separate value at all: if
 * it were folded into `no_rule`, a sentence added here later for «no priority
 * set» would appear for a seller whose priority IS set.
 *
 * COUNT-NOUN AGREEMENT IS AVOIDED, not solved: «несколько вариантов стоят» is
 * correct for two and for fourteen, and no number stands before a noun. Present
 * tense throughout, so nothing agrees with a carrier's gender. No provider key,
 * no adapter key, no carrier name — the line is about the parcel and the list.
 */
export function preselectNotice(
  preselect: { reason: PreselectReason; priority: OfferPriority | null },
): string | null {
  const { reason, priority } = preselect;
  if (priority == null) {
    return null;
  }
  if (reason === "rule") {
    return priority === "CHEAPEST"
      ? "Подставлен самый дешёвый из показанных."
      : "Подставлен самый быстрый из показанных.";
  }
  if (reason === "tie") {
    // «Показанных» on these two as well: all four sentences are claims about
    // the list on screen, which a chosen pickup point may have narrowed to one
    // carrier. Without it the line would read as a claim about the market.
    return priority === "CHEAPEST"
      ? "Несколько показанных вариантов стоят одинаково — выберите сами."
      : "Несколько показанных вариантов приезжают одинаково быстро — выберите сами.";
  }
  return null;
}

export type ResolvedPreselect = {
  offerId: string | null;
  reason: PreselectReason;
  priority: OfferPriority | null;
};

/**
 * THE MEMBERSHIP CHECK, DONE ONCE. A preselected id that is not in the list on
 * screen cannot be selected and must not be described either — so it is
 * resolved to «nothing was preselected» here, and both the selection and the
 * line read the SAME resolved value. Two separate checks would drift, and the
 * first symptom would be a line claiming a card that is not selected.
 */
export function resolvePreselect(
  preselect: ResolvedPreselect | null,
  offerIds: readonly string[],
): ResolvedPreselect | null {
  if (preselect === null) {
    return null;
  }
  if (preselect.offerId === null) {
    return preselect;
  }
  if (offerIds.includes(preselect.offerId)) {
    return preselect;
  }
  // The rule named a card the list does not contain. Nothing is selected, so
  // nothing may be claimed: `not_applicable` is the honest reading, and it is
  // silent.
  return { offerId: null, reason: "not_applicable", priority: preselect.priority };
}

/**
 * The line to show RIGHT NOW, given what is selected right now.
 *
 * TIED TO THE SELECTION, not to the moment the offers arrived. The `rule`
 * sentence describes the selected card, so it may only stand while that card is
 * still the selected one — the instant the seller clicks another, the sentence
 * would be describing a card they did not choose. The `tie` sentence says
 * nothing was selected and asks them to choose, so it stands only while nothing
 * is selected, and its job is done once they have.
 *
 * Both cases are the same comparison: the line shows while `selectedOfferId`
 * still equals what the rule produced.
 */
export function preselectLineFor(
  resolved: ResolvedPreselect | null,
  selectedOfferId: string | null,
): string | null {
  if (resolved === null) {
    return null;
  }
  if (selectedOfferId !== resolved.offerId) {
    return null;
  }
  return preselectNotice(resolved);
}
