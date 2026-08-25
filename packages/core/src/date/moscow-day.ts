/**
 * The seller-facing calendar day, in Moscow, for the carrier-neutral layer.
 *
 * WHY THIS LIVES IN core AND NOT IN apps/web. Both halves of the offers screen
 * — the order of the list and the badges on it — have to agree on what «the same
 * day» means, and one of them lives in each package. Two copies of a six-line
 * date helper is precisely how they would come to disagree, and a disagreement
 * about a day is a carrier ranked above another for no reason a seller could see.
 *
 * Only the primitive moved. Seller-facing formatting — «сегодня», «завтра», the
 * ru-RU labels — stays in apps/web, where the language belongs; this module
 * knows a calendar, not a wording.
 *
 * SHIPS IN THE BROWSER BUNDLE, so keep it to widely-supported syntax; see the
 * note in order-adapter-seller-titles.ts about ES2022 methods.
 */
export const MOSCOW_TIMEZONE = "Europe/Moscow";

/** Calendar day key YYYY-MM-DD in Europe/Moscow. */
export function moscowDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MOSCOW_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
