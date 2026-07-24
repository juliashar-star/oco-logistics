export const MOSCOW_TIMEZONE = "Europe/Moscow";

/** Moscow = seller-facing calendar day for Russian logistics; one formatter keeps CSV and timeline naming the same day. */
export function formatDateMoscow(date: Date): string {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: MOSCOW_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("day")}.${get("month")}.${get("year")}`;
}
