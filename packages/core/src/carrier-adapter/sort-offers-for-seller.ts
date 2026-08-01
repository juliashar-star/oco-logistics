import type { CarrierOffer } from "./types";

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Milliseconds of deliveryIntervalTo for sort keys.
 * Blank / unparseable interval → fall back to day-precision fields; still
 * +Infinity when neither is usable so unknown deadlines sort last.
 */
function deliveryDeadlineMs(offer: CarrierOffer): number {
  const raw = offer.deliveryIntervalTo;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed) {
      const ms = Date.parse(trimmed);
      if (!Number.isNaN(ms)) {
        return ms;
      }
    }
  }

  // Day-precision carriers leave interval fields blank and set YYYY-MM-DD.
  // Moscow has no DST (fixed UTC+03:00); sort by end of that Moscow calendar day.
  const dayRaw =
    typeof offer.deliveryDayTo === "string" && offer.deliveryDayTo.trim()
      ? offer.deliveryDayTo.trim()
      : typeof offer.deliveryDayFrom === "string"
        ? offer.deliveryDayFrom.trim()
        : "";
  if (DAY_KEY_RE.test(dayRaw)) {
    const ms = Date.parse(`${dayRaw}T23:59:59.999+03:00`);
    if (!Number.isNaN(ms)) {
      return ms;
    }
  }

  return Number.POSITIVE_INFINITY;
}

/**
 * Seller-facing order for a merged offer list:
 * soonest delivery deadline first, then cheaper, then offerId for stability.
 * Does not mutate the input.
 */
export function sortOffersForSeller(offers: CarrierOffer[]): CarrierOffer[] {
  return [...offers].sort((a, b) => {
    const da = deliveryDeadlineMs(a);
    const db = deliveryDeadlineMs(b);
    // Do not subtract: Infinity - Infinity is NaN and breaks Array.sort.
    if (da < db) {
      return -1;
    }
    if (da > db) {
      return 1;
    }
    const priceDiff = a.priceRub - b.priceRub;
    if (priceDiff !== 0) {
      return priceDiff;
    }
    if (a.offerId < b.offerId) {
      return -1;
    }
    if (a.offerId > b.offerId) {
      return 1;
    }
    return 0;
  });
}
