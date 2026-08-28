import { MOSCOW_TIMEZONE, moscowDayKey } from "@oco/core/date/moscow-day";

export { moscowDayKey };

function parseIso(iso: string): Date | null {
  const trimmed = iso.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatMoscowClockTime(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: MOSCOW_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * ONE SHAPE FOR A DAY, and it is the same shape each end of a range already
 * used: «27 августа». Built from `moscowDayMonthParts` rather than a second
 * `Intl` call, because a second call is a second decision about what a day looks
 * like, kept in step only by whoever remembers both exist.
 *
 * NO RELATIVE LABELS, AND NO WEEKDAY. «сегодня» and «завтра» cannot be written
 * for a range — a range has two ends and neither is today — so the screen spoke
 * two vocabularies at once and the seller had to hold «завтра» against
 * «27–28 августа» in their head to see which was sooner. An absolute date
 * compares with every other absolute date, which is the only thing this line is
 * for. The weekday went with them: it was carried by one branch out of three, so
 * it made the same day look different depending on which branch produced it.
 */
function formatMoscowDayLabel(date: Date): string {
  const { day, month } = moscowDayMonthParts(date);
  return `${day} ${month}`;
}

/**
 * Seller-facing offer interval in Europe/Moscow.
 * `now` is injected so the helper stays unit-testable.
 */
export function formatOfferInterval(
  fromIso: string,
  toIso: string,
  now: Date,
): string {
  const from = parseIso(fromIso);
  const to = parseIso(toIso);

  if (!from && !to) {
    return "";
  }
  if (from && !to) {
    return `${formatMoscowDayLabel(from)}, ${formatMoscowClockTime(from)}`;
  }
  if (!from && to) {
    return `${formatMoscowDayLabel(to)}, ${formatMoscowClockTime(to)}`;
  }

  // both usable
  if (from!.getTime() <= now.getTime()) {
    return `${formatMoscowDayLabel(to!)}, до ${formatMoscowClockTime(to!)}`;
  }
  if (moscowDayKey(from!) === moscowDayKey(to!)) {
    return `${formatMoscowDayLabel(from!)}, ${formatMoscowClockTime(from!)}–${formatMoscowClockTime(to!)}`;
  }
  return `${formatMoscowDayLabel(from!)} ${formatMoscowClockTime(from!)} — ${formatMoscowDayLabel(to!)} ${formatMoscowClockTime(to!)}`;
}

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse YYYY-MM-DD as noon UTC so the calendar day cannot shift across a
 * timezone boundary. Never `new Date(dayKey)`.
 */
function parseDayKeyNoonUtc(dayKey: string): Date | null {
  const trimmed = dayKey.trim();
  if (!DAY_KEY_RE.test(trimmed)) {
    return null;
  }
  const [year, month, day] = trimmed.split("-").map(Number);
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    noonUtc.getUTCFullYear() !== year ||
    noonUtc.getUTCMonth() !== month - 1 ||
    noonUtc.getUTCDate() !== day
  ) {
    return null;
  }
  return noonUtc;
}

/** Day + genitive month parts (month-alone is nominative in ru-RU). */
function moscowDayMonthParts(date: Date): { day: string; month: string } {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: MOSCOW_TIMEZONE,
    day: "numeric",
    month: "long",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return { day: get("day"), month: get("month") };
}

/**
 * Seller-facing day-precision delivery range (no clock time).
 *
 * `now` IS NO LONGER READ. It was here for the «сегодня» / «завтра» labels, and
 * those are gone — every day now renders as an absolute date. The parameter is
 * kept so the two exported formatters still take the same three arguments, and
 * because `formatOfferInterval` genuinely needs it. Dropping it is a signature
 * change, and one worth making deliberately rather than as a side effect.
 */
export function formatOfferDeliveryDays(
  dayFrom: string,
  dayTo: string,
  now: Date,
): string {
  const from = parseDayKeyNoonUtc(dayFrom);
  const to = parseDayKeyNoonUtc(dayTo);

  if (!from && !to) {
    return "";
  }
  if (from && !to) {
    return formatMoscowDayLabel(from);
  }
  if (!from && to) {
    return formatMoscowDayLabel(to);
  }

  if (moscowDayKey(from!) === moscowDayKey(to!)) {
    return formatMoscowDayLabel(from!);
  }

  const fromMonth = moscowDayKey(from!).slice(0, 7);
  const toMonth = moscowDayKey(to!).slice(0, 7);
  const fromParts = moscowDayMonthParts(from!);
  const toParts = moscowDayMonthParts(to!);
  if (fromMonth === toMonth) {
    return `${fromParts.day}–${toParts.day} ${toParts.month}`;
  }
  return `${fromParts.day} ${fromParts.month} — ${toParts.day} ${toParts.month}`;
}
