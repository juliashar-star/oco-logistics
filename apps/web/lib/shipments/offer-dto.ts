import type { CarrierOffersResult } from "@oco/core/carrier-adapter/types";

export type OfferDto = {
  offerId: string;
  expiresAt: string;
  deliveryIntervalFrom: string;
  deliveryIntervalTo: string;
  pickupIntervalFrom: string;
  pickupIntervalTo: string;
  priceRub: number;
};

export type OffersResponse = {
  ok: true;
  status: "ok" | "no_delivery_options";
  offers: OfferDto[];
};

/**
 * Boundary map: CarrierOffersResult → browser-safe DTO.
 * Fields named explicitly — never `{ ...offer }` — so rawOffer cannot leak.
 * no_delivery_options is a real answer (HTTP 200), not an error.
 */
export function toOffersResponse(result: CarrierOffersResult): OffersResponse {
  if (!result.ok) {
    return { ok: true, status: "no_delivery_options", offers: [] };
  }

  return {
    ok: true,
    status: "ok",
    offers: result.offers.map((offer) => ({
      offerId: offer.offerId,
      expiresAt: offer.expiresAt,
      deliveryIntervalFrom: offer.deliveryIntervalFrom,
      deliveryIntervalTo: offer.deliveryIntervalTo,
      pickupIntervalFrom: offer.pickupIntervalFrom,
      pickupIntervalTo: offer.pickupIntervalTo,
      priceRub: offer.priceRub,
    })),
  };
}
