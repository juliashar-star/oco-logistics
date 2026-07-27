import { MOSCOW_TIMEZONE } from "./format-date-moscow";

function parseIso(iso: string): Date | null {
  const trimmed = iso.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Calendar day key YYYY-MM-DD in Europe/Moscow. */
export function moscowDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MOSCOW_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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
