import { moscowDayKey } from "../date/moscow-day";

/**
 * The fields a deadline is read from. Optional because the callers differ in
 * OPTIONALITY, not in which fields they hold: the sort passes a whole
 * CarrierOffer, where the day fields may be absent, while the badges pass the
 * browser DTO, where they have already been normalised to strings.
 *
 * EVERY CALLER CARRIES `deliveryDayFrom`. An earlier version of this comment
 * said only the sort's CarrierOffer did, and that was wrong in both halves —
 * the DTO always had it, and OfferHighlightInput now declares it too. The
 * sentence mattered: it invited a caller to build a narrower object, which is
 * exactly what happened, and the fallback below silently stopped applying for
 * CDEK rows that name only a start day.
 */
export type OfferDeadlineFields = {
  deliveryIntervalTo?: string | null;
  deliveryDayTo?: string | null;
  deliveryDayFrom?: string | null;
};

/**
 * When an offer promises to be delivered BY, at the precision the LIST can use.
 * `timeMs` is null when the carrier quoted no clock time — or when it did, but
 * another offer on the same day did not.
 */
export type OfferDeadline = { dayKey: string; timeMs: number | null };

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function trimmed(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * THE LATE EDGE, NOT THE EARLY ONE. Ranking by the start of a window flatters
 * the widest interval: an offer promising «today 09:00–21:00» would beat one
 * promising «today 10:00–12:00», although the second is the one a seller can
 * rely on. The late edge is what both carriers actually commit to.
 *
 * A timed interval wins over a day range when both are somehow present: it is
 * the finer of the two, and its calendar day is derived from it rather than read
 * from a field that might disagree. Measured today no adapter fills both —
 * Yandex fills only intervals, CDEK only days.
 *
 * `deliveryDayFrom` is the fallback when `deliveryDayTo` is blank. Without it an
 * offer that named only a start day would have no deadline at all and would sink
 * to the end of the list, which is worse than placing it on the day it named.
 */
function rawDeadline(fields: OfferDeadlineFields): OfferDeadline | null {
  const iso = trimmed(fields.deliveryIntervalTo);
  if (iso !== "") {
    const parsed = new Date(iso);
    const ms = parsed.getTime();
    if (!Number.isNaN(ms)) {
      return { dayKey: moscowDayKey(parsed), timeMs: ms };
    }
  }

  const dayTo = trimmed(fields.deliveryDayTo);
  const day = dayTo !== "" ? dayTo : trimmed(fields.deliveryDayFrom);
  if (DAY_KEY_RE.test(day)) {
    return { dayKey: day, timeMs: null };
  }

  return null;
}

/**
 * ONE definition of «sooner» for the whole offers screen — used by the order of
 * the list and by the badges on it, so the two can never contradict each other.
 *
 * THE DAY IS THE SHARED UNIT. Carriers answer in different precisions and cannot
 * be made to answer in each other's: CDEK quotes calendar days and leaves every
 * interval blank, Yandex quotes clock times and fills no day field. Comparing
 * them by anything finer than the day means comparing a real number against an
 * invented one. The wider industry settled the same way — aggregators normalise
 * transit time to whole days and get intervals from a separate call.
 *
 * THE HOUR PARTICIPATES ONLY WHERE THE WHOLE DAY SPEAKS IT. Within one calendar
 * day, if every offer on that day carries a clock time, the hour orders them; if
 * even one does not, the hour is masked out for that day and the day is all they
 * share. Never invent an hour for a day range: «Доставка 25–26 августа» says
 * nothing about when on the 25th, and substituting midnight — or noon, or the end
 * of the day, which this sort did until 25.08 — decides the ranking on a number
 * the carrier never sent, systematically placing one carrier above another for a
 * reason that is purely a matter of response format.
 *
 * WHY A LIST FUNCTION AND NOT A PAIRWISE COMPARATOR. The masking is a property of
 * a group, so it is computed here, in one pass, and baked into each element
 * BEFORE anything is compared. A comparator that decided «use the finer of these
 * two» pairwise would not be transitive — A at 09:00 beats C at 18:00 on the
 * hour, while both merely tie with day-only B, and prices could then order
 * B before A — and Array.sort on an intransitive comparator produces garbage.
 * Comparing pre-computed scalars lexicographically is total by construction.
 *
 * SCOPE IS THE DAY, NOT THE LIST. An offer without an hour masks only its own
 * day, not every day. Widening this to the whole list would let an offer on a
 * LATER day change which offers count as fastest, and the badges must not depend
 * on a stranger that is not even in contention.
 *
 * ACCEPTED COST, named because it is real: a CDEK offer landing on the same day
 * as two Yandex offers removes the hour from their ordering, and they fall back
 * to price although one of them genuinely arrives earlier. Narrow in practice —
 * CDEK never quotes today and Express never quotes beyond today — and it
 * disappears once the list is grouped by service.
 *
 * DEGENERATE INPUT IS CONTRACT, not accident, because two callers depend on it:
 *   - empty list → empty array;
 *   - one offer → one element; a lone timed offer keeps its hour, since a group
 *     of one is trivially all-timed;
 *   - no offer with a usable deadline → an array of nulls, same length as the
 *     input. A null means «this offer cannot be placed in time», and both callers
 *     put such offers last rather than dropping them.
 * The result is ALWAYS parallel to the input, index for index.
 */
export function comparableOfferDeadlines<T>(
  offers: readonly T[],
  read: (offer: T) => OfferDeadlineFields,
): (OfferDeadline | null)[] {
  const raw = offers.map((offer) => rawDeadline(read(offer)));

  const dayHasUntimed = new Map<string, boolean>();
  for (const deadline of raw) {
    if (deadline === null) {
      continue;
    }
    if (deadline.timeMs === null) {
      dayHasUntimed.set(deadline.dayKey, true);
    } else if (!dayHasUntimed.has(deadline.dayKey)) {
      dayHasUntimed.set(deadline.dayKey, false);
    }
  }

  return raw.map((deadline) => {
    if (deadline === null) {
      return null;
    }
    if (dayHasUntimed.get(deadline.dayKey) === true) {
      return { dayKey: deadline.dayKey, timeMs: null };
    }
    return deadline;
  });
}
