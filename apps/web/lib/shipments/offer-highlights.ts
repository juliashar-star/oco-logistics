// A package specifier, not the "@/" alias: this module is reached from tests/
// through tsx, which resolves workspace package exports but not the Next path
// alias (same reason build-offer-input.ts imports "../sender-address").
import { comparableOfferDeadlines } from "@oco/core/carrier-adapter/offer-deadline";
import type { OfferDeadline } from "@oco/core/carrier-adapter/offer-deadline";

export type OfferHighlightTag = "cheaper" | "faster" | "cheapest_of_fastest";

/** Seller-facing badge text. Lowercase, like the other small card lines. */
export const OFFER_HIGHLIGHT_LABELS: Record<OfferHighlightTag, string> = {
  cheaper: "дешевле",
  faster: "быстрее",
  cheapest_of_fastest: "дешевле из быстрых",
};

/**
 * Only the fields the comparison reads — the card passes whole OfferDto rows.
 *
 * ALL THREE DEADLINE FIELDS ARE LISTED, and the third is not decoration.
 * `comparableOfferDeadlines` falls back to `deliveryDayFrom` when
 * `deliveryDayTo` is blank (offer-deadline.ts: without it an offer that named
 * only a start day would have no deadline at all and would sink to the end of
 * the list). This type used to declare only two, and structural typing hid it:
 * the screen passes whole DTO rows, so the field arrived anyway, while any
 * caller that BUILT an object from the declared fields silently dropped it and
 * got a different answer from the same function. Declaring what is actually
 * read is what stops a second definition of «sooner» entering through the
 * input instead of through the comparison.
 */
export type OfferHighlightInput = {
  offerId: string;
  priceRub: number;
  /** ISO timestamp of the LATE edge; "" when the carrier quoted no clock time. */
  deliveryIntervalTo: string;
  /** YYYY-MM-DD late edge; "" when the carrier quoted a timed interval instead. */
  deliveryDayTo: string;
  /** YYYY-MM-DD early edge; the FALLBACK when deliveryDayTo is blank. */
  deliveryDayFrom: string;
};

type Entry = {
  offer: OfferHighlightInput;
  deadline: OfferDeadline | null;
};

/**
 * EVERY entry that ties for the best deadline of a set.
 *
 * THE COMPARISON ITSELF IS NOT HERE. It lives in `comparableOfferDeadlines`, in
 * packages/core, and the ORDER of the list is built from the very same call —
 * one definition of «sooner» for the whole screen. Until 25.08 there were two,
 * and they disagreed: the sort substituted the end of the Moscow day for a day
 * range, so a Yandex offer was placed above a CDEK offer promising the same day,
 * while these badges called the two equally fast. Read that module for the rule
 * itself, for why the hour is masked per DAY rather than per pair, and for the
 * accepted cost of the masking.
 *
 * What is left here is the selection: the earliest day, and within it the
 * earliest hour when that day carries hours at all. Masking has already happened
 * upstream, so `timeMs` is uniform inside one day — either every entry has one
 * or none does.
 *
 * RETURNS THE WHOLE TIE, and every caller keeps the whole of it. «Быстрее»
 * badges this set outright; «дешевле из быстрых» narrows it by price and says
 * so in its own name. Nothing reduces this set silently — that reduction is
 * exactly what used to make a badge assert speed on a decision taken about
 * cost.
 */
function deadlineLeaders(
  entries: readonly Entry[],
): (Entry & { deadline: OfferDeadline })[] {
  const usable = entries.filter(
    (entry): entry is Entry & { deadline: OfferDeadline } =>
      entry.deadline !== null,
  );
  if (usable.length === 0) {
    return [];
  }

  let minDay = usable[0]!.deadline.dayKey;
  for (const entry of usable) {
    if (entry.deadline.dayKey < minDay) {
      minDay = entry.deadline.dayKey;
    }
  }
  const sameDay = usable.filter((entry) => entry.deadline.dayKey === minDay);

  const everyLeaderTimed = sameDay.every(
    (entry) => entry.deadline.timeMs !== null,
  );
  if (!everyLeaderTimed) {
    return sameDay;
  }

  let minMs = sameDay[0]!.deadline.timeMs!;
  for (const entry of sameDay) {
    if (entry.deadline.timeMs! < minMs) {
      minMs = entry.deadline.timeMs!;
    }
  }
  return sameDay.filter((entry) => entry.deadline.timeMs === minMs);
}

/** Minimum of a non-empty list of finite prices. */
function minPriceOf(entries: readonly Entry[]): number {
  let min = entries[0]!.offer.priceRub;
  for (const entry of entries) {
    if (entry.offer.priceRub < min) {
      min = entry.offer.priceRub;
    }
  }
  return min;
}

/**
 * Which offers deserve a «дешевле» / «быстрее» / «дешевле из быстрых» badge.
 *
 * A BADGE'S NAME MUST BE TRUE OF WHAT THE BADGE MEASURES. That single rule
 * shapes all three, and it is why none of them breaks a tie any more: a tie is
 * settled by badging everyone in it, never by choosing. Every earlier version
 * chose — «дешевле» once fell back to the earlier deadline and then to list
 * position, «быстрее» to the lower price — so a word about price was decided by
 * time, and a word about time by money, with nothing on screen saying so.
 *
 * - «дешевле» — EVERY offer at the minimum price. A cheapest offer that arrives
 *   later is exactly as cheap; the word claims price and nothing else.
 * - «быстрее» — EVERY offer tying on the best deadline (deadlineLeaders).
 * - «дешевле из быстрых» — the cheapest offers WITHIN that fastest set. The one
 *   badge that states a trade-off, and its name says which two things traded.
 *
 * THE THIRD BADGE IS EMITTED ONLY WHEN IT SAYS SOMETHING THE OTHER TWO DO NOT,
 * which takes two conditions, each blocking a different duplicate:
 *   (a) the global minimum price is NOT among the fastest — otherwise the
 *       cheapest offer is already one of the fastest, wears both other badges,
 *       and the third would only restate them;
 *   (b) the fastest set holds at least TWO DISTINCT prices — otherwise every
 *       fastest offer is equally cheap, the badge would land on all of them,
 *       and it would restate «быстрее». This also rules out a single fastest
 *       offer, where «the cheapest of the fast» is a claim about a set of one.
 * Together they make the third badge a STRICT subset of «быстрее» that never
 * overlaps «дешевле». It appears exactly when the cheapest option is slow AND
 * the fast ones differ in price — the only situation in which a seller has a
 * trade-off to weigh.
 *
 * STILL NOT «ОПТИМАЛЬНО». The third tag is not a quality verdict: it is derived
 * from the two numbers already on the card. A badge weighing carrier quality
 * would need Carrier Score, which is unbuilt — rankQuotes substitutes a neutral
 * 50 for every carrier — and a claim computed from a placeholder is one we
 * cannot stand behind.
 *
 * FEWER THAN TWO OFFERS → NO BADGES AT ALL. «Дешевле» on a list of one is not
 * a comparison, it is decoration, and it would read as a claim about the market
 * rather than about the list.
 *
 * Keyed by offerId, which the card already treats as unique (it is the React
 * key). One offer can carry more than one tag.
 */
export function offerHighlights(
  offers: readonly OfferHighlightInput[],
): Map<string, OfferHighlightTag[]> {
  const result = new Map<string, OfferHighlightTag[]>();
  if (offers.length < 2) {
    return result;
  }

  // `?? null` rather than `!`: the parallel-array promise is real but invisible
  // to the compiler, and a non-null assertion would hide a later drift instead
  // of failing on it. Same reason as in sortOffersForSeller.
  const deadlines = comparableOfferDeadlines(offers, (offer) => offer);
  const entries: Entry[] = offers.map((offer, index) => ({
    offer,
    deadline: deadlines[index] ?? null,
  }));

  const addTag = (offerId: string, tag: OfferHighlightTag) => {
    const existing = result.get(offerId);
    if (existing) {
      existing.push(tag);
      return;
    }
    result.set(offerId, [tag]);
  };

  // ── cheaper ──────────────────────────────────────────────────────────────
  // PRICE ALONE. No deadline enters here: a minimum-price offer that arrives
  // later is still exactly as cheap, and the word claims nothing about when.
  const priced = entries.filter((entry) =>
    Number.isFinite(entry.offer.priceRub),
  );
  const globalMinPrice = priced.length > 0 ? minPriceOf(priced) : null;
  if (globalMinPrice !== null) {
    for (const entry of priced) {
      if (entry.offer.priceRub === globalMinPrice) {
        addTag(entry.offer.offerId, "cheaper");
      }
    }
  }

  // ── faster ───────────────────────────────────────────────────────────────
  // THE WHOLE TIE, unreduced. Offers a seller cannot tell apart on the deadline
  // must not be told apart by the badge — least of all by their price, which is
  // not what this word is about.
  const fastest = deadlineLeaders(entries);
  for (const entry of fastest) {
    addTag(entry.offer.offerId, "faster");
  }

  // ── cheapest of the fastest ──────────────────────────────────────────────
  const fastestPriced = fastest.filter((entry) =>
    Number.isFinite(entry.offer.priceRub),
  );
  if (globalMinPrice !== null && fastestPriced.length > 0) {
    const pricesAmongFastest = new Set(
      fastestPriced.map((entry) => entry.offer.priceRub),
    );
    // (a) the cheapest offer is NOT one of the fastest — otherwise it already
    //     wears «дешевле» and «быстрее» and this would restate them; and
    // (b) the fastest differ in price — otherwise this set equals «быстрее».
    const cheapestIsSlow = !pricesAmongFastest.has(globalMinPrice);
    const fastestDifferInPrice = pricesAmongFastest.size >= 2;
    if (cheapestIsSlow && fastestDifferInPrice) {
      const minAmongFastest = minPriceOf(fastestPriced);
      for (const entry of fastestPriced) {
        if (entry.offer.priceRub === minAmongFastest) {
          addTag(entry.offer.offerId, "cheapest_of_fastest");
        }
      }
    }
  }

  return result;
}
