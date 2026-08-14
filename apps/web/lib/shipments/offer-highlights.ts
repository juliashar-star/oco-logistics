// Relative, not the "@/" alias: this module is reached from tests/ through tsx,
// which does not resolve the Next path alias (same reason build-offer-input.ts
// imports "../sender-address").
import { moscowDayKey } from "../date/format-offer-interval";

export type OfferHighlightTag = "cheaper" | "faster";

/** Seller-facing badge text. Lowercase, like the other small card lines. */
export const OFFER_HIGHLIGHT_LABELS: Record<OfferHighlightTag, string> = {
  cheaper: "дешевле",
  faster: "быстрее",
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
 * Fastest of a set, compared AT THE COARSEST PRECISION THE SET SHARES.
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
 * Ties: the cheaper offer, then the earlier one in the list.
 */
function pickFastest(entries: readonly Entry[]): Entry | null {
  const usable = entries.filter(
    (entry): entry is Entry & { deadline: Deadline } => entry.deadline !== null,
  );
  if (usable.length === 0) {
    return null;
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
  let finalists = sameDay;
  if (everyLeaderTimed) {
    let minMs = sameDay[0]!.deadline.timeMs!;
    for (const entry of sameDay) {
      if (entry.deadline.timeMs! < minMs) {
        minMs = entry.deadline.timeMs!;
      }
    }
    finalists = sameDay.filter((entry) => entry.deadline.timeMs === minMs);
  }

  return finalists.reduce((best, entry) =>
    entry.offer.priceRub < best.offer.priceRub ? entry : best,
  );
}

/**
 * Which offers deserve a «дешевле» / «быстрее» badge.
 *
 * TWO TAGS, NOT THREE. A third — «оптимально» — would have to weigh price
 * against speed against carrier quality, and the quality half has no data
 * behind it: Carrier Score is unbuilt, and rankQuotes substitutes a neutral 50
 * for every carrier. A badge computed from a placeholder is a claim we cannot
 * stand behind, and the landing page promises exactly these two.
 *
 * FEWER THAN TWO OFFERS → NO BADGES AT ALL. «Дешевле» on a list of one is not
 * a comparison, it is decoration, and it would read as a claim about the market
 * rather than about the list.
 *
 * Keyed by offerId, which the card already treats as unique (it is the React
 * key). One offer can carry both tags.
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
  const priced = entries.filter((entry) =>
    Number.isFinite(entry.offer.priceRub),
  );
  if (priced.length > 0) {
    let minPrice = priced[0]!.offer.priceRub;
    for (const entry of priced) {
      if (entry.offer.priceRub < minPrice) {
        minPrice = entry.offer.priceRub;
      }
    }
    const tied = priced.filter((entry) => entry.offer.priceRub === minPrice);
    // Same price → the one that arrives sooner; still tied → the first listed.
    const winner = tied.length === 1 ? tied[0]! : pickFastest(tied) ?? tied[0]!;
    addTag(winner.offer.offerId, "cheaper");
  }

  // ── faster ───────────────────────────────────────────────────────────────
  const fastest = pickFastest(entries);
  if (fastest !== null) {
    addTag(fastest.offer.offerId, "faster");
  }

  return result;
}
