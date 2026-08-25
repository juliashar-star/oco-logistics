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

/** Next calendar day after a YYYY-MM-DD key (date-only arithmetic). */
function nextCalendarDayKey(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  noonUtc.setUTCDate(noonUtc.getUTCDate() + 1);
  const y = noonUtc.getUTCFullYear();
  const m = String(noonUtc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(noonUtc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatMoscowClockTime(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: MOSCOW_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatMoscowDayLabel(date: Date, now: Date): string {
  const day = moscowDayKey(date);
  const today = moscowDayKey(now);
  if (day === today) {
    return "сегодня";
  }
  if (day === nextCalendarDayKey(today)) {
    return "завтра";
  }
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: MOSCOW_TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(date);
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
    return `${formatMoscowDayLabel(from, now)}, ${formatMoscowClockTime(from)}`;
  }
  if (!from && to) {
    return `${formatMoscowDayLabel(to, now)}, ${formatMoscowClockTime(to)}`;
  }

  // both usable
  if (from!.getTime() <= now.getTime()) {
    return `${formatMoscowDayLabel(to!, now)}, до ${formatMoscowClockTime(to!)}`;
  }
  if (moscowDayKey(from!) === moscowDayKey(to!)) {
    return `${formatMoscowDayLabel(from!, now)}, ${formatMoscowClockTime(from!)}–${formatMoscowClockTime(to!)}`;
  }
  return `${formatMoscowDayLabel(from!, now)} ${formatMoscowClockTime(from!)} — ${formatMoscowDayLabel(to!, now)} ${formatMoscowClockTime(to!)}`;
}

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse YYYY-MM-DD as noon UTC (same approach as nextCalendarDayKey) so the
 * calendar day cannot shift across a timezone boundary. Never `new Date(dayKey)`.
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
 * `now` is injected so today/tomorrow labels stay unit-testable.
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
    return formatMoscowDayLabel(from, now);
  }
  if (!from && to) {
    return formatMoscowDayLabel(to, now);
  }

  if (moscowDayKey(from!) === moscowDayKey(to!)) {
    return formatMoscowDayLabel(from!, now);
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
