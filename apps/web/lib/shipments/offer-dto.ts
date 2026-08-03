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
  /**
   * Whether this offer's SERVICE can carry a thermal bag.
   * Resolved from the registry by adapterKey (same path as serviceTitle) —
   * the browser must not know which adapter keys support what.
   */
  supportsThermalBag: boolean;
  /** YYYY-MM-DD when the carrier quotes by day; "" when absent. */
  deliveryDayFrom: string;
  deliveryDayTo: string;
  /** True when the quote is an estimate, not a commitment. */
  priceIsEstimate: boolean;
};

export type OffersResponse = {
  ok: true;
  status: "ok" | "no_delivery_options";
  offers: OfferDto[];
};

export type ResolveOfferServiceTitle = (
  adapterKey: string | undefined,
) => string;

export type ResolveOfferSupportsThermalBag = (
  adapterKey: string | undefined,
) => boolean;

/**
 * Boundary map: CarrierOffersResult → browser-safe DTO.
 * Fields named explicitly — never `{ ...offer }` — so rawOffer cannot leak.
 * no_delivery_options is a real answer (HTTP 200), not an error.
 * Resolvers are required so every caller decides how adapterKey maps to
 * seller-facing metadata (this module does not import the registry).
 */
export function toOffersResponse(
  result: CarrierOffersResult,
  resolveServiceTitle: ResolveOfferServiceTitle,
  resolveSupportsThermalBag: ResolveOfferSupportsThermalBag,
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
      supportsThermalBag: resolveSupportsThermalBag(offer.adapterKey),
      deliveryDayFrom: offer.deliveryDayFrom ?? "",
      deliveryDayTo: offer.deliveryDayTo ?? "",
      priceIsEstimate: offer.priceIsEstimate === true,
    })),
  };
}
