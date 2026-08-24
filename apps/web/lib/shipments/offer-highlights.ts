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
 * RETURNS THE WHOLE TIE, not one of it. Both badges need this set, and they
 * need the SAME one: «быстрее» reduces it to a single winner, «дешевле» keeps
 * all of it. Splitting the precision rules into two copies is how the two
 * badges would come to disagree about what «same deadline» means.
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

/**
 * Fastest of a set — the single «быстрее» winner.
 *
 * Ties: the cheaper offer, then the earlier one in the list. UNCHANGED by the
 * «дешевле» rewrite.
 *
 * OPEN QUESTION FOR THE NEXT SLICE, and the reason it is written down here.
 * `deadlineLeaders` may return SEVERAL equally fast offers; this function then
 * reduces them to one BY PRICE, and by list position when the price ties too.
 * So four offers all arriving «завтра» at 150, 525.45, 592.73 and 660 ₽ —
 * measured on screen 24.08 — put «быстрее» on the 150 ₽ card alone, not on all
 * four. Nothing is indistinguishable there, so the badge does not claim a
 * difference that is absent; the defect is subtler. The badge asserts SPEED
 * while the winner among equally fast offers was chosen on COST, and it says so
 * nowhere. Behaviour deliberately left as it is in this slice.
 */
function pickFastest(entries: readonly Entry[]): Entry | null {
  const finalists = deadlineLeaders(entries);
  if (finalists.length === 0) {
    return null;
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
    // EVERY offer at the minimum price that also ties on the best deadline
    // AMONG THOSE OFFERS — never one of them chosen by list position.
    //
    // TWO OFFERS A SELLER CANNOT TELL APART MUST NOT GET DIFFERENT BADGES. The
    // old rule broke that tie by «first listed», so of fourteen rows identical
    // in price and date exactly one wore «дешевле» — announcing a difference
    // that does not exist. Cheapest-but-slower still gets nothing: that one IS
    // distinguishable, and saying so is the badge's job.
    //
    // No suppression when everything ties. Hiding the badge on an all-equal
    // list would make it depend on a STRANGER: one expensive offer appearing
    // would pop badges onto every other card, though none of them changed.
    //
    // Deadline-less minimums fall back to the whole tie — offers nobody can
    // order by deadline are indistinguishable on it, which is this rule's
    // whole premise.
    const leaders = deadlineLeaders(tied);
    const winners = leaders.length > 0 ? leaders : tied;
    for (const winner of winners) {
      addTag(winner.offer.offerId, "cheaper");
    }
  }

  // ── faster ───────────────────────────────────────────────────────────────
  const fastest = pickFastest(entries);
  if (fastest !== null) {
    addTag(fastest.offer.offerId, "faster");
  }

  return result;
}
