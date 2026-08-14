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
  /**
   * Carrier's own seller-facing name for this offer's service (e.g. CDEK
   * tariff name). "" when absent — always on the wire so the key set is
   * identical for every carrier.
   */
  serviceName: string;
  /**
   * Masked seller-facing carrier name (e.g. «Перевозчик №1»).
   * Resolved from adapterKey → providerKey → display map — providerKey
   * itself never goes on the wire.
   */
  carrierName: string;
  /**
   * Neutral key for when free cancellation stops being possible.
   * Resolved from the registry by adapterKey (same path as serviceTitle) —
   * the browser must not know which adapter keys support what. A KEY, not a
   * sentence: the wording is the UI layer's (offerFreeCancelNote).
   */
  freeCancelBoundary: string;
};

/**
 * One connected adapter that contributed nothing to the list beside it.
 *
 * THREE FIELDS, AND NEITHER OF THE TWO KEYS. `adapterKey` and `providerKey` are
 * internal identifiers: the first tells the browser which registry entries exist,
 * the second is the carrier identity the display map exists to mask. Both are
 * resolved on the server into the same two strings the offer card already shows,
 * and only those cross. (The pickup-points DTO does put `providerKey` on the
 * wire; that is not a precedent we follow here.)
 *
 * The PAIR is required, not one name: three yataxi entries share one providerKey,
 * so `carrierName` alone cannot say which service went missing, and
 * `yataxi:next_day` and `cdek:delivery` share the title «Доставка по России», so
 * `serviceTitle` alone cannot say which carrier.
 */
export type OfferAdapterWithoutOffersDto = {
  carrierName: string;
  serviceTitle: string;
  status: string;
};

export type OffersResponse = {
  ok: true;
  status: "ok" | "no_delivery_options";
  offers: OfferDto[];
  /**
   * Adapters that were asked and returned nothing usable. Structure, not prose —
   * the sentence is the UI layer's, the same split as freeCancelBoundary.
   */
  adaptersWithoutOffers: OfferAdapterWithoutOffersDto[];
};

export type ResolveOfferServiceTitle = (
  adapterKey: string | undefined,
) => string;

export type ResolveOfferSupportsThermalBag = (
  adapterKey: string | undefined,
) => boolean;

export type ResolveOfferCarrierName = (
  adapterKey: string | undefined,
) => string;

export type ResolveOfferFreeCancelBoundary = (
  adapterKey: string | undefined,
) => string;

/**
 * Boundary map: CarrierOffersResult → browser-safe DTO.
 * Fields named explicitly — never `{ ...offer }` — so rawOffer cannot leak.
 * no_delivery_options is a real answer (HTTP 200), not an error.
 * Resolvers are required so every caller decides how adapterKey maps to
 * seller-facing metadata (this module does not import the registry).
 *
 * `adaptersWithoutOffers` is REQUIRED rather than defaulted: a caller that has
 * the fan-out's per-adapter statuses and forgets to pass them would silently
 * ship the old silence, which is the defect. Branches with nothing to report
 * pass an empty array and say so.
 */
export function toOffersResponse(
  result: CarrierOffersResult,
  resolveServiceTitle: ResolveOfferServiceTitle,
  resolveSupportsThermalBag: ResolveOfferSupportsThermalBag,
  resolveCarrierName: ResolveOfferCarrierName,
  resolveFreeCancelBoundary: ResolveOfferFreeCancelBoundary,
  adaptersWithoutOffers: readonly OfferAdapterWithoutOffersDto[],
): OffersResponse {
  // Named explicitly, like every other field here — never a spread of the
  // fan-out entry, which carries the adapter key.
  const withoutOffers = adaptersWithoutOffers.map((entry) => ({
    carrierName: entry.carrierName,
    serviceTitle: entry.serviceTitle,
    status: entry.status,
  }));

  if (!result.ok) {
    return {
      ok: true,
      status: "no_delivery_options",
      offers: [],
      adaptersWithoutOffers: withoutOffers,
    };
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
      serviceName: offer.serviceName ?? "",
      carrierName: resolveCarrierName(offer.adapterKey),
      freeCancelBoundary: resolveFreeCancelBoundary(offer.adapterKey),
    })),
    adaptersWithoutOffers: withoutOffers,
  };
}
