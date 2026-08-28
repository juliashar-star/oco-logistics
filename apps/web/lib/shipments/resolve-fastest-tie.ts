import type { OfferHighlightTag } from "./offer-highlights";

/**
 * When several offers tie on the deadline under FASTEST, which one — if any —
 * the price already singles out ON SCREEN.
 *
 * READS TAGS, COMPUTES NOTHING. Not one comparison of a price or a date happens
 * here: the function asks which offers the badge layer already marked and counts
 * them. That is the whole reason this tie-break is allowed to exist. A helper
 * that recomputed «the cheapest among the fastest» would be a second opinion
 * about cheapness, free to drift from the badges, and the seller would see the
 * selection land on a card the screen had not marked.
 *
 * WHY TWO TAGS AND NOT ONE. «дешевле из быстрых» is emitted only when it says
 * something the other badges do not — offer-highlights.ts suppresses it when the
 * globally cheapest offer is itself among the fastest, because that offer
 * already wears «дешевле» and a third badge would only restate it. So the
 * cheapest of the fastest wears «дешевле из быстрых» in one case and «дешевле»
 * in the other, and this function has to look for both.
 *
 * THE TWO SETS CANNOT OVERLAP, which is what makes the fallback unambiguous
 * rather than a guess: «дешевле из быстрых» is emitted only when the global
 * minimum is NOT among the fastest, and in that case no fastest offer carries
 * «дешевле». Exactly one of the two lookups can ever find anything.
 *
 * EVERY «STILL TIED» CASE FALLS OUT OF COUNTING, none is special-cased:
 *   - the fastest all share one price → «дешевле из быстрых» is suppressed as
 *     redundant, and either every one of them wears «дешевле» (when that price
 *     is the global minimum) or none does. Both give a count that is not 1.
 *   - several share the cheapest price among the fastest → both tags land on
 *     all of them, count > 1.
 *   - no usable price anywhere → the badge layer, which filters non-finite
 *     prices before it tags anything, emitted neither tag. Count 0. This is why
 *     no guard against NaN is needed here: the guard already ran upstream, and
 *     duplicating it would be the second opinion this function exists to avoid.
 *
 * NOT APPLIED TO CHEAPEST, and that boundary is the decision, not an omission.
 * There is no «быстрее из дешёвых» badge, so a tie among equally-priced offers
 * broken by the deadline would put the selection on a card the screen marks no
 * differently from its neighbours — the seller would see a choice made on
 * something never mentioned. That is the 24.08 defect from the other side. See
 * docs/OFFER_PRESELECT.md §4.
 */
export function resolveFastestTie(
  winners: readonly { offerId: string }[],
  tags: ReadonlyMap<string, readonly OfferHighlightTag[]>,
): string | null {
  const taggedWith = (tag: OfferHighlightTag) =>
    winners.filter((offer) => (tags.get(offer.offerId) ?? []).includes(tag));

  const cheapestOfFastest = taggedWith("cheapest_of_fastest");
  const candidates =
    cheapestOfFastest.length > 0 ? cheapestOfFastest : taggedWith("cheaper");

  return candidates.length === 1 ? candidates[0]!.offerId : null;
}
