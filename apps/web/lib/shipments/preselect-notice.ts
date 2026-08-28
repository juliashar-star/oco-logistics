import type { OfferPriority, PreselectReason } from "./preselect-offer";

/**
 * The three states of the settings control. «Nothing» is the NULL column.
 *
 * ONE WORD FOR ONE THING: «тариф». The screen used to carry «вариант», «оффер»
 * and «тариф» for the same row, and a seller reading three words has to work out
 * whether they name three things. The offers table already headed its column
 * «Тариф», so that is the word the rest of the product moved to.
 */
export const OFFER_PRIORITY_LEGEND_RU = "Какой тариф выбирать автоматически";
export const OFFER_PRIORITY_NONE_RU = "Не выбирать — выберу сам";
export const OFFER_PRIORITY_CHEAPEST_RU = "Самый дешёвый";
export const OFFER_PRIORITY_FASTEST_RU = "Самый быстрый";

/**
 * Said under the control, because the setting is worth nothing to a seller who
 * fears it will lock them in. It states the exact scope of a departure: this
 * order, and the setting is untouched.
 */
export const OFFER_PRIORITY_HINT_RU =
  "Выбранный тариф можно заменить в любом заказе — настройка от этого не изменится.";

/**
 * The line beside the offer list, or null when nothing is to be said.
 *
 * IT NAMES THE REASON, because a selection a seller cannot explain is one they
 * have to undo to trust. «Приоритет задан в настройках» tells them WHY this row
 * is selected and where to change it, which is the difference between a helpful
 * default and a screen that moved on its own.
 *
 * NO LINK TO SETTINGS, deliberately. The sender-address banner directly above
 * already links to the same page, and two links to one destination on one screen
 * read as two destinations.
 *
 * «ИЗ ПОКАЗАННЫХ» IS LOAD-BEARING, not filler, and the two rule sentences carry
 * both it and the reason. A chosen pickup point narrows the list to the carrier
 * that owns it, so the set the rule chose from can be one carrier's tariffs.
 * Without the scoping phrase the line claims the cheapest tariff that EXISTS,
 * which is more than we know; with it the sentence stays true however the list
 * was narrowed. The tie sentences need no such phrase — «у нескольких тарифов»
 * is already a claim about some tariffs rather than about all of them.
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
 * COUNT-NOUN AGREEMENT IS AVOIDED, not solved: «у нескольких тарифов» puts the
 * noun in the genitive plural, which is correct for two and for fourteen alike,
 * and no number stands before it. Present tense throughout, so nothing agrees
 * with a carrier's gender. No provider key, no adapter key, no carrier name —
 * the line is about the parcel and the list.
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
      ? "Выбран самый дешёвый из показанных тарифов — приоритет задан в настройках."
      : "Выбран самый быстрый из показанных тарифов — приоритет задан в настройках.";
  }
  if (reason === "tie") {
    // NAMES WHAT TIED, not just that something did. A seller told «несколько
    // тарифов одинаковы» learns nothing they can act on; told the PRICE is the
    // same, they know to decide on the deadline instead, and the reverse.
    return priority === "CHEAPEST"
      ? "У нескольких тарифов одинаковая цена — выберите подходящий."
      : "У нескольких тарифов одинаковый срок — выберите подходящий.";
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
