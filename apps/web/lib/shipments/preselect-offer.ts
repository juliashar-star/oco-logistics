import { offerHighlights, type OfferHighlightInput } from "./offer-highlights";

/**
 * The company's default priority. Deliberately its OWN two-value union rather
 * than an import of the Prisma enum, and that is a compile-time guard, not
 * style: the route assigns Prisma's `OfferPriority | null` into this parameter,
 * so the day a third value is added to the database enum the assignment stops
 * type-checking AT THE CALL SITE. A runtime `default:` branch here would have
 * swallowed the new value in silence instead.
 */
export type OfferPriority = "CHEAPEST" | "FASTEST";

/**
 * Why a card is preselected, or why none is.
 *
 * `no_rule` MEANS ONLY «NO PRIORITY IS SET», and nothing else may be folded
 * into it. `not_applicable` means a priority IS set but the criterion cannot be
 * applied to this list: not one offer carries a usable price under CHEAPEST, or
 * a usable deadline under FASTEST.
 *
 * Both preselect nothing, and today both are silent — so it would be tempting
 * to have one name. They are separate because they differ in what may later be
 * SAID about them. The moment someone attaches «приоритет не задан — задайте в
 * настройках» to `no_rule`, that sentence would appear for a seller whose
 * priority is set and simply had nothing to apply to. That is the same shape of
 * defect as a new adapter status hidden inside an old name and falling through
 * every branch of the offers route into a 500: a state that exists but has no
 * name of its own is a state nothing can handle correctly.
 *
 * `tie` is NOT the answer for the empty-winner case either. A tie means several
 * offers are indistinguishable on the criterion; here there is nothing to tie,
 * and «несколько вариантов стоят одинаково» about a list where no offer has a
 * price would be false.
 */
export type PreselectReason =
  | "rule"
  | "tie"
  | "single"
  | "no_rule"
  | "not_applicable";

export type PreselectResult = {
  offerId: string | null;
  reason: PreselectReason;
  /**
   * WHICH CRITERION WAS APPLIED, carried so the result is self-describing.
   * The wording of the line beside the list depends on it — «стоят одинаково»
   * versus «приезжают одинаково быстро» — and the browser has no other way to
   * learn the company's setting on this screen. Structure, not prose: the
   * sentence is still the UI layer's (preselect-notice).
   */
  priority: OfferPriority | null;
};

/**
 * The offer as the ROUTE holds it — `CarrierOffer` leaves the day fields
 * optional, while the browser's DTO has already turned them into "". Accepting
 * the loose shape here keeps the normalisation in ONE place and makes it the
 * SAME normalisation the DTO performs (`?? ""`, offer-dto.ts), so the list this
 * rule reasons about and the list the screen badges hold identical values in
 * every field the comparison touches — the id, the price, and all three
 * deadline fields.
 */
export type PreselectOfferInput = {
  offerId: string;
  priceRub: number;
  deliveryIntervalTo?: string;
  deliveryDayTo?: string;
  /**
   * CARRIED, NOT DROPPED. `comparableOfferDeadlines` uses it as the fallback
   * when `deliveryDayTo` is blank, and CDEK produces exactly that shape. An
   * earlier version of this type omitted it, so the screen could tag «быстрее»
   * on an offer this rule reported as `not_applicable` — a second definition of
   * «sooner» entering through the INPUT rather than through the comparison,
   * which is the one thing the shared deadline module exists to prevent.
   */
  deliveryDayFrom?: string;
};

function asHighlightInput(offer: PreselectOfferInput): OfferHighlightInput {
  return {
    offerId: offer.offerId,
    priceRub: offer.priceRub,
    deliveryIntervalTo: offer.deliveryIntervalTo ?? "",
    deliveryDayTo: offer.deliveryDayTo ?? "",
    deliveryDayFrom: offer.deliveryDayFrom ?? "",
  };
}

/**
 * Which offer card should arrive already selected — and, just as often, that
 * none should.
 *
 * IT READS `offerHighlights`, IT DOES NOT RE-DERIVE. The winning set for
 * CHEAPEST is exactly the set the screen tags «дешевле»; for FASTEST, exactly
 * the set tagged «быстрее». Recomputing the minimum price and the deadline here
 * — even with the same helpers — would create a second opinion that could drift
 * from the badges; reading the same result is the only construction in which
 * they cannot disagree. `rankQuotes` is not used and must not be: it picks ONE
 * winner where the badge tags the whole set, ranks speed by the EARLY edge where
 * the badge uses the late one, and its «optimal» rests on a placeholder score.
 *
 * A TIE PRESELECTS NOTHING. The badge rules refuse to break a tie on principle —
 * two offers a seller cannot tell apart on a criterion must not be told apart by
 * us — and a rule that quietly chose one would reintroduce exactly the hidden
 * tie-break those rules removed. The caller says so on screen instead.
 *
 * `single` HAS ITS OWN BRANCH because `offerHighlights` returns an empty map for
 * a list shorter than two: «дешевле» on a list of one is decoration, not a
 * comparison. So with one offer there are no tags to read, and the rule
 * preselects it directly — without claiming it is cheapest or fastest, because
 * no comparison happened.
 *
 * THE TWO SILENT REASONS ARE NOT INTERCHANGEABLE. `no_rule` is returned only
 * when no priority is set; a priority that cannot be applied to this list
 * returns `not_applicable`. Both preselect nothing today, and the difference is
 * kept so that a sentence attached to one later cannot appear for the other —
 * see the docblock on PreselectReason.
 */
export function preselectOffer(
  offers: readonly PreselectOfferInput[],
  priority: OfferPriority | null | undefined,
): PreselectResult {
  if (priority == null) {
    return { offerId: null, reason: "no_rule", priority: null };
  }
  // A priority is set and there is no list to apply it to — the criterion has
  // nothing to measure, which is `not_applicable`, not «no priority».
  if (offers.length === 0) {
    return { offerId: null, reason: "not_applicable", priority };
  }
  if (offers.length === 1) {
    return { offerId: offers[0]!.offerId, reason: "single", priority };
  }

  const wanted = priority === "CHEAPEST" ? "cheaper" : "faster";
  const tags = offerHighlights(offers.map(asHighlightInput));
  const winners = offers.filter((offer) =>
    (tags.get(offer.offerId) ?? []).includes(wanted),
  );

  if (winners.length === 1) {
    return { offerId: winners[0]!.offerId, reason: "rule", priority };
  }
  if (winners.length > 1) {
    return { offerId: null, reason: "tie", priority };
  }
  // No winner at all: nothing in this list carries the thing the criterion
  // measures — no usable price under CHEAPEST, no usable deadline under
  // FASTEST. Not a tie, and not «no priority set».
  return { offerId: null, reason: "not_applicable", priority };
}
