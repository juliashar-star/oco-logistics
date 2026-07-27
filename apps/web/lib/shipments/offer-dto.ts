import type { CarrierOffersResult } from "@oco/core/carrier-adapter/types";

export type OfferDto = {
  offerId: string;
  expiresAt: string;
  deliveryIntervalFrom: string;
  deliveryIntervalTo: string;
  pickupIntervalFrom: string;
  pickupIntervalTo: string;
  priceRub: number;
  serviceTitle: string;
};

export type OffersResponse = {
  ok: true;
  status: "ok" | "no_delivery_options";
  offers: OfferDto[];
};

export type ResolveOfferServiceTitle = (
  adapterKey: string | undefined,
) => string;

/**
 * Boundary map: CarrierOffersResult → browser-safe DTO.
 * Fields named explicitly — never `{ ...offer }` — so rawOffer cannot leak.
 * no_delivery_options is a real answer (HTTP 200), not an error.
 * `resolveServiceTitle` is required so every caller decides how adapterKey maps
 * to a seller-facing service name (this module does not import the registry).
 */
export function toOffersResponse(
  result: CarrierOffersResult,
  resolveServiceTitle: ResolveOfferServiceTitle,
): OffersResponse {
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
      serviceTitle: resolveServiceTitle(offer.adapterKey),
    })),
  };
}
