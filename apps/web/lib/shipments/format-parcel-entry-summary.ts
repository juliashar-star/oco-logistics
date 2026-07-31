/**
 * Data-entry sanity ceilings — NOT carrier limits and NOT a block on tariff fit.
 * WHY these numbers: they sit far outside anything the currently connected
 * services carry (Yandex ПВЗ is 30 kg, Express 20 kg), so a larger value is a
 * typo today. The ceiling must be RAISED deliberately if the Грузовой tariff
 * (up to 4 tonnes) is ever added — a future slice must not trip over it silently.
 */
export const PARCEL_ENTRY_MAX_WEIGHT_G = 100_000;
export const PARCEL_ENTRY_MAX_SIDE_CM = 200;

/** Number after the noun so Russian count-noun agreement never applies. */
export const PARCEL_ENTRY_WEIGHT_TOO_LARGE =
  "Вес — не больше 100 кг";
export const PARCEL_ENTRY_SIDE_TOO_LARGE =
  "Каждая сторона — не больше 200 см";

function parseEntryNumber(value: string | number): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatWeightKg(weightG: number): string {
  return (weightG / 1000).toLocaleString("ru-RU", {
    maximumFractionDigits: 3,
    minimumFractionDigits: 0,
    useGrouping: false,
  });
}

/**
 * Seller-facing echo under the parcel fields.
 * WHY the sum of sides: carriers actually band tariffs on it — DPD's box tariff
 * is priced in bands of 60 / 75 / 90 / 120 / 180 cm of summed sides, and a
 * postamat's limit is a sum of 118 cm — so the seller should see the number that
 * decides their price rather than compute it.
 * Returns null for empty or unparseable input (never "NaN").
 */
export function formatParcelEntrySummary(
  weightG: string | number,
  lengthCm: string | number,
  widthCm: string | number,
  heightCm: string | number,
): string | null {
  const weight = parseEntryNumber(weightG);
  const length = parseEntryNumber(lengthCm);
  const width = parseEntryNumber(widthCm);
  const height = parseEntryNumber(heightCm);
  if (weight === null || length === null || width === null || height === null) {
    return null;
  }

  const sumCm = length + width + height;
  const sumLabel = Number.isInteger(sumCm)
    ? String(sumCm)
    : sumCm.toLocaleString("ru-RU", {
        maximumFractionDigits: 1,
        useGrouping: false,
      });

  return `${formatWeightKg(weight)} кг · сумма сторон ${sumLabel} см`;
}

/** Data-entry ceiling only — null when within bounds. */
export function parcelEntryCeilingError(
  weightG: number,
  lengthCm: number,
  widthCm: number,
  heightCm: number,
): string | null {
  if (weightG > PARCEL_ENTRY_MAX_WEIGHT_G) {
    return PARCEL_ENTRY_WEIGHT_TOO_LARGE;
  }
  if (
    lengthCm > PARCEL_ENTRY_MAX_SIDE_CM ||
    widthCm > PARCEL_ENTRY_MAX_SIDE_CM ||
    heightCm > PARCEL_ENTRY_MAX_SIDE_CM
  ) {
    return PARCEL_ENTRY_SIDE_TOO_LARGE;
  }
  return null;
}
