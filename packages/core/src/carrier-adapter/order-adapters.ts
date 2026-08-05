import type { CarrierAdapter } from "./types";
import {
  confirmOffer as cdekConfirmOffer,
  getOffers as cdekGetOffers,
} from "./cdek/client";
import { orderAdapterSellerTitle } from "./order-adapter-seller-titles";
import { yandexAdapter } from "./yandex/adapter";
import {
  confirmExpressOffer,
  getExpressOffers,
} from "./yandex/express-client";
import {
  EXPRESS_TAXI_CLASS_LIMITS,
  expressTaxiClassCapacity,
} from "./yandex/express-taxi-class-limits";

/**
 * Order-path capability only — not a full CarrierAdapter.
 * Call sites that need getOffers / confirmOffer / cancelOrder resolve by
 * composite key here instead of hardcoding a carrier module.
 *
 * The key is composite because one carrier can expose several API families
 * (Yandex «в другой день» vs Express claims/*), while credentials are per
 * carrier, not per service. providerKey on the entry is what
 * getCarrierCredentials looks up.
 *
 * title comes from order-adapter-seller-titles (seller display metadata) so
 * client code can resolve a label without importing this registry.
 */
export type OrderAdapter = {
  key: string;
  providerKey: string;
  /**
   * Seller-facing name of the SERVICE.
   * Descriptive wording on purpose — not the carrier's own product name,
   * which is covered by the display-name masking in provider-seller-display-names.
   */
  title: string;
  /**
   * Comparable capacity of this service's parcel limits (higher = wider).
   * Fed to same-provider same-interval dedupe as a price-tie breaker —
   * not "whichever entry came first in the registry". Absent on families
   * without rated Express-class caps (e.g. next_day).
   */
  offerLimitCapacity?: number;
  /**
   * Whether this SERVICE can carry a thermal bag.
   * Same optional shape as offerLimitCapacity. True on Express-family
   * entries; absent/false on next_day — the other-day (request/*) family
   * documents no thermal / temperature / insulated-bag option at all.
   */
  supportsThermalBag?: boolean;
  getOffers: CarrierAdapter["getOffers"];
  confirmOffer: CarrierAdapter["confirmOffer"];
  cancelOrder: CarrierAdapter["cancelOrder"];
  /**
   * Optional: shipping-label PDF. Absent on families with no label method
   * (e.g. Express claims/*). Looked up by orderAdapterKey — never by
   * providerKey alone (next_day and express share "yataxi").
   */
  generateLabels?: CarrierAdapter["generateLabels"];
  /**
   * Optional: акт приёма-передачи PDF. Other-day only today; Express has none.
   * Looked up by orderAdapterKey — never by providerKey alone.
   */
  getHandoverAct?: CarrierAdapter["getHandoverAct"];
};

const expressCancelStub: CarrierAdapter["cancelOrder"] = async () => {
  throw new Error("Оформление этой услуги ещё не реализовано");
};

const cdekCancelStub: CarrierAdapter["cancelOrder"] = async () => {
  throw new Error("Оформление этой услуги ещё не реализовано");
};

export const ORDER_ADAPTERS: Record<string, OrderAdapter> = {
  "yataxi:next_day": {
    key: "yataxi:next_day",
    providerKey: yandexAdapter.providerKey,
    title: orderAdapterSellerTitle("yataxi:next_day"),
    // No supportsThermalBag — other-day (request/*) documents no thermal
    // option (method index + create/calculate bodies). Marked on the card
    // when the seller asked for a bag; not hidden from the list.
    getOffers: yandexAdapter.getOffers,
    confirmOffer: yandexAdapter.confirmOffer,
    cancelOrder: yandexAdapter.cancelOrder,
    generateLabels: yandexAdapter.generateLabels,
    getHandoverAct: yandexAdapter.getHandoverAct,
  },
  "yataxi:express": {
    key: "yataxi:express",
    providerKey: yandexAdapter.providerKey,
    title: orderAdapterSellerTitle("yataxi:express"),
    offerLimitCapacity: expressTaxiClassCapacity(
      EXPRESS_TAXI_CLASS_LIMITS.express,
    ),
    supportsThermalBag: true,
    getOffers: (input, credentials) =>
      getExpressOffers(input, credentials, "express"),
    // Same as getOffers: registry supplies the entry's taxi class.
    confirmOffer: (offer, input, credentials) =>
      confirmExpressOffer(offer, input, credentials, "express"),
    // Cancelling an ACCEPTED order can be PAID, so exposing it to a seller
    // without warning is a product decision, not a mapping.
    cancelOrder: expressCancelStub,
    // No generateLabels / getHandoverAct — Express claims/* has neither.
  },
  "yataxi:courier": {
    key: "yataxi:courier",
    providerKey: yandexAdapter.providerKey,
    title: orderAdapterSellerTitle("yataxi:courier"),
    offerLimitCapacity: expressTaxiClassCapacity(
      EXPRESS_TAXI_CLASS_LIMITS.courier,
    ),
    supportsThermalBag: true,
    getOffers: (input, credentials) =>
      getExpressOffers(input, credentials, "courier"),
    confirmOffer: (offer, input, credentials) =>
      confirmExpressOffer(offer, input, credentials, "courier"),
    cancelOrder: expressCancelStub,
  },
  "cdek:delivery": {
    key: "cdek:delivery",
    providerKey: "cdek",
    title: orderAdapterSellerTitle("cdek:delivery"),
    // No offerLimitCapacity ON PURPOSE: CDEK offers carry blank delivery
    // intervals, so they all share one dedupe key, and the unrated-capacity
    // branch is what keeps all of them. Adding a capacity here would collapse
    // the whole CDEK list to its cheapest row.
    getOffers: cdekGetOffers,
    confirmOffer: cdekConfirmOffer,
    cancelOrder: cdekCancelStub,
  },
};

/**
 * Fallback for absent/unknown orderAdapterKey (pre-adapterKey quotes, bad keys).
 * Grep anchor when a real service selector lands.
 */
export const DEFAULT_ORDER_ADAPTER = ORDER_ADAPTERS["yataxi:next_day"];

export function getOrderAdapter(key: string): OrderAdapter | undefined {
  return ORDER_ADAPTERS[key];
}

/**
 * Resolve an ORDER_ADAPTERS entry for submit/cancel.
 * Absent or unknown key → DEFAULT_ORDER_ADAPTER (keeps pre-adapterKey quotes working).
 * getOrderAdapter stays string-only; this helper is the honest optional path.
 */
export function resolveOrderAdapter(
  adapterKey: string | null | undefined,
): OrderAdapter {
  if (adapterKey == null || adapterKey === "") {
    return DEFAULT_ORDER_ADAPTER;
  }
  const found = getOrderAdapter(adapterKey);
  if (found === undefined) {
    console.error(
      "[order-adapters] UNKNOWN_ORDER_ADAPTER_KEY",
      JSON.stringify({ adapterKey }),
    );
    return DEFAULT_ORDER_ADAPTER;
  }
  return found;
}
