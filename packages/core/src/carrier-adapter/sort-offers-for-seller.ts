import type { CarrierOffer } from "./types";

/**
 * Milliseconds of deliveryIntervalTo for sort keys.
 * Blank / unparseable → +Infinity so unknown deadlines sort last.
 */
function deliveryDeadlineMs(offer: CarrierOffer): number {
  const raw = offer.deliveryIntervalTo;
  if (typeof raw !== "string") {
    return Number.POSITIVE_INFINITY;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return Number.POSITIVE_INFINITY;
  }
  const ms = Date.parse(trimmed);
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
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
