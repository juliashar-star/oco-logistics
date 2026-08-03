import type { CarrierOffer } from "../types";

function parseDeliverySum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Keep as-sent when non-empty after trim; omit blanks. Never rewrite the string. */
function optionalNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return value.trim().length > 0 ? value : undefined;
}

/**
 * Map CDEK calculator/tarifflist `tariff_codes` into neutral CarrierOffer[].
 *
 * WHY SKIP RATHER THAN THROW: the Yandex mappers throw on a missing price,
 * which suits a 3–11 offer reply. CDEK returns 24–30 rows, so one malformed
 * row must not blank the seller's whole list.
 */
export function mapCdekTariffsToOffers(
  raw: unknown,
  deliveryMode: number,
): CarrierOffer[] {
  if (raw === null || typeof raw !== "object") {
    return [];
  }
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.tariff_codes)) {
    return [];
  }

  const offers: CarrierOffer[] = [];
  for (const element of record.tariff_codes) {
    if (element === null || typeof element !== "object") {
      continue;
    }
    const row = element as Record<string, unknown>;

    if (typeof row.tariff_code !== "number" || !Number.isFinite(row.tariff_code)) {
      continue;
    }
    if (
      typeof row.delivery_mode !== "number" ||
      !Number.isFinite(row.delivery_mode) ||
      row.delivery_mode !== deliveryMode
    ) {
      continue;
    }
    const priceRub = parseDeliverySum(row.delivery_sum);
    if (priceRub === null) {
      continue;
    }

    const offer: CarrierOffer = {
      offerId: `cdek:${row.tariff_code}`,
      expiresAt: "",
      deliveryIntervalFrom: "",
      deliveryIntervalTo: "",
      pickupIntervalFrom: "",
      pickupIntervalTo: "",
      priceRub,
      priceIsEstimate: true,
      rawOffer: element,
    };

    const serviceName = optionalNonEmptyString(row.tariff_name);
    if (serviceName !== undefined) {
      offer.serviceName = serviceName;
    }

    const range =
      row.delivery_date_range !== null &&
      typeof row.delivery_date_range === "object"
        ? (row.delivery_date_range as Record<string, unknown>)
        : null;
    if (range) {
      const dayFrom = optionalNonEmptyString(range.min);
      const dayTo = optionalNonEmptyString(range.max);
      if (dayFrom !== undefined) {
        offer.deliveryDayFrom = dayFrom;
      }
      if (dayTo !== undefined) {
        offer.deliveryDayTo = dayTo;
      }
    }

    offers.push(offer);
  }

  return offers;
}
