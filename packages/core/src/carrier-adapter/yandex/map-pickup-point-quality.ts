import type {
  CarrierPickupPointSchedule,
  CarrierPickupPointScheduleEntry,
} from "../types";

export type PickupPointQualityFields = {
  isDarkStore: boolean;
  deactivationDate: string | null;
  dayOffs: string[];
  schedule: CarrierPickupPointSchedule | null;
};

function isDayTime(value: unknown): value is { hours: number; minutes: number } {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const o = value as Record<string, unknown>;
  return typeof o.hours === "number" && typeof o.minutes === "number";
}

/**
 * Yandex docs type date_utc as integer; the wire sends a date string.
 * Prefer that string as-sent (not normalised — format not guaranteed; measured
 * offsets like +0000 are not ECMAScript's portable ISO form). Fall back to
 * numeric `date` only when, read as unix SECONDS, it lands in years 2000–2100
 * absolute — that answers «seconds or milliseconds» without Date.now(). A
 * relative window would make this function clock-dependent and expire its own
 * tests; a milliseconds value read as seconds lands tens of thousands of years
 * out and is skipped. The unit is documented but never observed on tst
 * (date_utc always present). Element with neither usable field is skipped.
 */
export function mapYandexDayOffs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: string[] = [];
  // Absolute ms bounds for years 2000–2100 UTC — not relative to now.
  const minMs = Date.UTC(2000, 0, 1);
  const maxMs = Date.UTC(2100, 0, 1);
  for (const item of value) {
    if (item === null || typeof item !== "object") {
      continue;
    }
    const o = item as Record<string, unknown>;
    if (typeof o.date_utc === "string" && o.date_utc.trim().length > 0) {
      out.push(o.date_utc);
      continue;
    }
    if (typeof o.date === "number" && Number.isFinite(o.date)) {
      // WHY: docs say unix seconds, but that branch is untested on tst
      // (date_utc always a string). Reject outside 2000–2100 so a milliseconds
      // mis-read cannot become a year-56000 string — absolute range, no clock.
      const convertedMs = o.date * 1000;
      if (convertedMs < minMs || convertedMs >= maxMs) {
        continue;
      }
      out.push(new Date(convertedMs).toISOString());
    }
  }
  return out;
}

export function mapYandexIsDarkStore(value: unknown): boolean {
  return value === true;
}

/** Closing date as the provider sent it when a non-empty string; else null. Not normalised. */
export function mapYandexDeactivationDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function mapYandexSchedule(
  value: unknown,
): CarrierPickupPointSchedule | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const o = value as Record<string, unknown>;
  if (typeof o.time_zone !== "number" || !Number.isFinite(o.time_zone)) {
    return null;
  }
  const entries: CarrierPickupPointScheduleEntry[] = [];
  if (Array.isArray(o.restrictions)) {
    for (const restriction of o.restrictions) {
      if (restriction === null || typeof restriction !== "object") {
        continue;
      }
      const r = restriction as Record<string, unknown>;
      if (!Array.isArray(r.days) || !isDayTime(r.time_from) || !isDayTime(r.time_to)) {
        continue;
      }
      const weekdays: number[] = [];
      for (const day of r.days) {
        if (typeof day === "number" && Number.isFinite(day)) {
          weekdays.push(day);
        }
      }
      if (weekdays.length === 0) {
        continue;
      }
      entries.push({
        weekdays,
        from: { hours: r.time_from.hours, minutes: r.time_from.minutes },
        to: { hours: r.time_to.hours, minutes: r.time_to.minutes },
      });
    }
  }
  return { utcOffsetHours: o.time_zone, entries };
}

/**
 * Read the four quality fields from a raw pickup-point object.
 *
 * available_for_dropoff is NOT modelled: docs define it as «Доступен ли ПВЗ
 * для сдачи юридическими лицами» — the SENDER handing a parcel in — whereas
 * our pickup point is the DESTINATION where the BUYER collects. On tst
 * Moscow 30.07 it was true on only 19 of 809 points; filtering by it would
 * discard 97.7% of usable points. Relevant only if OCO adds seller drop-off.
 */
export function mapYandexPickupPointQuality(
  raw: unknown,
): PickupPointQualityFields {
  const record =
    raw !== null && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : null;

  return {
    isDarkStore: mapYandexIsDarkStore(record?.is_dark_store),
    deactivationDate: mapYandexDeactivationDate(record?.deactivation_date),
    dayOffs: mapYandexDayOffs(record?.dayoffs),
    schedule: mapYandexSchedule(record?.schedule),
  };
}
