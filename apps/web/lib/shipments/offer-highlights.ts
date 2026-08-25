// Relative, not the "@/" alias: this module is reached from tests/ through tsx,
// which does not resolve the Next path alias (same reason build-offer-input.ts
// imports "../sender-address").
import { moscowDayKey } from "../date/format-offer-interval";

export type OfferHighlightTag = "cheaper" | "faster" | "cheapest_of_fastest";

/** Seller-facing badge text. Lowercase, like the other small card lines. */
export const OFFER_HIGHLIGHT_LABELS: Record<OfferHighlightTag, string> = {
  cheaper: "дешевле",
  faster: "быстрее",
  cheapest_of_fastest: "дешевле из быстрых",
};

/** Only the fields the comparison reads — the card passes whole OfferDto rows. */
export type OfferHighlightInput = {
  offerId: string;
  priceRub: number;
  /** ISO timestamp of the LATE edge; "" when the carrier quoted no clock time. */
  deliveryIntervalTo: string;
  /** YYYY-MM-DD late edge; "" when the carrier quoted a timed interval instead. */
  deliveryDayTo: string;
};

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * When an offer promises to be delivered BY, at the finest precision it gave.
 * `timeMs` is null for a carrier that quoted calendar days only.
 */
type Deadline = { dayKey: string; timeMs: number | null };

/**
 * THE LATE EDGE, NOT THE EARLY ONE. Ranking by the start of a window flatters
 * the widest interval: an offer promising «today 09:00–21:00» would beat one
 * promising «today 10:00–12:00», although the second is the one a seller can
 * rely on. The late edge is what both carriers actually commit to.
 *
 * A timed interval wins over a day range when both are somehow present: it is
 * the finer of the two, and its calendar day is derived from it rather than
 * read from a field that might disagree. Measured today no adapter fills both —
 * Yandex fills only intervals, CDEK only days.
 */
function deadlineOf(offer: OfferHighlightInput): Deadline | null {
  const iso = offer.deliveryIntervalTo?.trim() ?? "";
  if (iso !== "") {
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) {
      return { dayKey: moscowDayKey(parsed), timeMs: parsed.getTime() };
    }
  }
  const day = offer.deliveryDayTo?.trim() ?? "";
  if (DAY_KEY_RE.test(day)) {
    return { dayKey: day, timeMs: null };
  }
  return null;
}

type Entry = {
  offer: OfferHighlightInput;
  index: number;
  deadline: Deadline | null;
};

/**
 * EVERY entry that ties for the best deadline of a set, compared AT THE
 * COARSEST PRECISION THE SET SHARES.
 *
 * The calendar day decides first, because every usable deadline has one. Clock
 * time is consulted ONLY when every offer still in contention carries one.
 *
 * NEVER GIVE A DAY RANGE AN HOUR. «Доставка 22–26 августа» says nothing about
 * when on the 22nd, and inventing midnight — or any other hour — to make it
 * comparable would decide the ranking on a number the carrier never sent. That
 * is the same invention the offer card refuses when it renders a day as a day
 * (format-offer-lines.ts), and the same one the planned delivery date refuses
 * when CDEK's blank intervals leave plannedDeliveryDate null rather than
 * fabricating a clock time (submit-order.ts). A ranking rule may not be looser
 * than the rules that display the same values.
 *
 * Comparing at the shared precision also keeps the answer independent of input
 * order: picking the minimum day first, then narrowing, is a total order at
 * each step, which pairwise «finer of the two» comparisons would not be.
 *
 * RETURNS THE WHOLE TIE, and every caller keeps the whole of it. «Быстрее»
 * badges this set outright; «дешевле из быстрых» narrows it by price and says
 * so in its own name. Nothing reduces this set silently — that reduction is
 * exactly what used to make a badge assert speed on a decision taken about
 * cost.
 *
 * NO BUSINESS-DAY ARITHMETIC, and that is deliberate. These are the deadlines
 * the carrier gave us; a weekend counts as days like any other. Inventing a
 * working-day calendar here would rank offers on a rule the carrier never
 * applied, the same way inventing an hour would.
 */
function deadlineLeaders(
  entries: readonly Entry[],
): (Entry & { deadline: Deadline })[] {
  const usable = entries.filter(
    (entry): entry is Entry & { deadline: Deadline } => entry.deadline !== null,
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

  // Clock time only when EVERY leader has one — otherwise the day is all they
  // share, and the day has already decided as much as it can.
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

  const entries: Entry[] = offers.map((offer, index) => ({
    offer,
    index,
    deadline: deadlineOf(offer),
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
