import {
  formatOfferDeliveryDays,
  formatOfferInterval,
} from "./format-offer-interval";

type OfferLineInput = {
  deliveryIntervalFrom: string;
  deliveryIntervalTo: string;
  pickupIntervalFrom: string;
  pickupIntervalTo: string;
  deliveryDayFrom?: string;
  deliveryDayTo?: string;
};

/**
 * Seller-facing delivery line: timed interval wins; otherwise day-precision.
 */
export function formatOfferDeliveryLine(
  offer: OfferLineInput,
  now: Date,
): string {
  const timed = formatOfferInterval(
    offer.deliveryIntervalFrom,
    offer.deliveryIntervalTo,
    now,
  );
  if (timed) {
    return timed;
  }
  return formatOfferDeliveryDays(
    offer.deliveryDayFrom ?? "",
    offer.deliveryDayTo ?? "",
    now,
  );
}

/**
 * Seller-facing pickup line. Timed interval only — no day fallback
 * (inventing a pickup window the carrier did not quote would be a lie).
 */
export function formatOfferPickupLine(
  offer: OfferLineInput,
  now: Date,
): string {
  return formatOfferInterval(
    offer.pickupIntervalFrom,
    offer.pickupIntervalTo,
    now,
  );
}
