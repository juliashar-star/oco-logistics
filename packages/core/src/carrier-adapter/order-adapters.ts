import type { CarrierAdapter } from "./types";
import { orderAdapterSellerTitle } from "./order-adapter-seller-titles";
import { yandexAdapter } from "./yandex/adapter";
import {
  confirmExpressOffer,
  getExpressOffers,
} from "./yandex/express-client";

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
  getOffers: CarrierAdapter["getOffers"];
  confirmOffer: CarrierAdapter["confirmOffer"];
  cancelOrder: CarrierAdapter["cancelOrder"];
  /**
   * Optional: shipping-label PDF. Absent on families with no label method
   * (e.g. Express claims/*). Looked up by orderAdapterKey — never by
   * providerKey alone (next_day and express share "yataxi").
   */
  generateLabels?: CarrierAdapter["generateLabels"];
};

export const ORDER_ADAPTERS: Record<string, OrderAdapter> = {
  "yataxi:next_day": {
    key: "yataxi:next_day",
    providerKey: yandexAdapter.providerKey,
    title: orderAdapterSellerTitle("yataxi:next_day"),
    getOffers: yandexAdapter.getOffers,
    confirmOffer: yandexAdapter.confirmOffer,
    cancelOrder: yandexAdapter.cancelOrder,
    generateLabels: yandexAdapter.generateLabels,
  },
  "yataxi:express": {
    key: "yataxi:express",
    providerKey: yandexAdapter.providerKey,
    title: orderAdapterSellerTitle("yataxi:express"),
    getOffers: getExpressOffers,
    confirmOffer: confirmExpressOffer,
    // Cancelling an ACCEPTED order can be PAID, so exposing it to a seller
    // without warning is a product decision, not a mapping.
    cancelOrder: async () => {
      throw new Error("Оформление этой услуги ещё не реализовано");
    },
    // No generateLabels — Express claims/* has no label endpoint.
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
