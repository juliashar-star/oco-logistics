import type { CarrierAdapter } from "./types";
import { yandexAdapter } from "./yandex/adapter";

/**
 * Order-path capability only — not a full CarrierAdapter.
 * Call sites that need getOffers / confirmOffer / cancelOrder resolve by
 * composite key here instead of hardcoding a carrier module.
 *
 * The key is composite because one carrier can expose several API families
 * (Yandex «в другой день» vs Express claims/*), while credentials are per
 * carrier, not per service. providerKey on the entry is what
 * getCarrierCredentials looks up.
 */
export type OrderAdapter = {
  key: string;
  providerKey: string;
  getOffers: CarrierAdapter["getOffers"];
  confirmOffer: CarrierAdapter["confirmOffer"];
  cancelOrder: CarrierAdapter["cancelOrder"];
};

export const ORDER_ADAPTERS: Record<string, OrderAdapter> = {
  "yataxi:next_day": {
    key: "yataxi:next_day",
    providerKey: yandexAdapter.providerKey,
    getOffers: yandexAdapter.getOffers,
    confirmOffer: yandexAdapter.confirmOffer,
    cancelOrder: yandexAdapter.cancelOrder,
  },
};

/**
 * Temporary scaffolding: the only registered order path until a service
 * selector exists. Grep anchor for that future slice.
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
