import { comparableOfferDeadlines } from "./offer-deadline";
import type { CarrierOffer } from "./types";

/**
 * Seller-facing order for a merged offer list: soonest first, then cheaper, then
 * offerId for stability. Does not mutate the input.
 *
 * THE DEADLINE COMES FROM comparableOfferDeadlines, the one definition the badges
 * use as well. Until 25.08 this file had its own: it substituted the END OF THE
 * MOSCOW DAY for a day range, so a Yandex offer always sorted above a CDEK offer
 * that promised the same day — one carrier placed above another for nothing but
 * the format of its reply — while the badges beside the list called the two
 * equally fast. The screen contradicted itself. Nothing here may reintroduce a
 * second opinion about what «the same day» means.
 *
 * A DEADLINE-LESS OFFER SORTS LAST and keeps its price/id ordering among its
 * peers; it is not dropped.
 *
 * The keys are computed in one pass before sorting, never inside the comparator:
 * see offer-deadline.ts for why a pairwise «finer of the two» rule would not be
 * transitive.
 */
export function sortOffersForSeller(offers: CarrierOffer[]): CarrierOffer[] {
  const deadlines = comparableOfferDeadlines(offers, (offer) => offer);
  // `?? null` rather than an assertion: comparableOfferDeadlines promises an
  // array parallel to its input, but the compiler cannot see that promise, and a
  // later signature change would slip through an `as` in silence.
  const keyed = offers.map((offer, index) => ({
    offer,
    deadline: deadlines[index] ?? null,
  }));

  keyed.sort((a, b) => {
    const aDeadline = a.deadline;
    const bDeadline = b.deadline;

    // Exactly one deadline missing → that offer goes last.
    if ((aDeadline === null) !== (bDeadline === null)) {
      return aDeadline === null ? 1 : -1;
    }

    if (aDeadline !== null && bDeadline !== null) {
      if (aDeadline.dayKey !== bDeadline.dayKey) {
        return aDeadline.dayKey < bDeadline.dayKey ? -1 : 1;
      }
      // Within one day the mask is uniform: either both carry an hour or
      // neither does, so this never compares a number against null.
      const at = aDeadline.timeMs;
      const bt = bDeadline.timeMs;
      if (at !== null && bt !== null && at !== bt) {
        return at < bt ? -1 : 1;
      }
    }
    // BOTH deadlines missing lands here too, and that is deliberate: two offers
    // nobody can place in time are tied on the deadline, so the price and the id
    // order them exactly as they order any other tie.

    const priceDiff = a.offer.priceRub - b.offer.priceRub;
    if (priceDiff !== 0) {
      return priceDiff;
    }
    if (a.offer.offerId < b.offer.offerId) {
      return -1;
    }
    if (a.offer.offerId > b.offer.offerId) {
      return 1;
    }
    return 0;
  });

  return keyed.map((entry) => entry.offer);
}
