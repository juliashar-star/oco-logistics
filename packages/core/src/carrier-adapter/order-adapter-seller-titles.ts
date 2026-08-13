/**
 * Seller-facing service titles.
 * Single source for orderAdapterKey → title — do not hardcode these in components.
 * ORDER_ADAPTERS.title reads from here so the registry and the UI cannot drift.
 */
export const ORDER_ADAPTER_SELLER_TITLES: Readonly<Record<string, string>> = {
  // Name the service, not a speed: sandbox 31.07 showed Moscow next-day but
  // Saint Petersburg two days; the offer card already shows the real dates.
  "yataxi:next_day": "Доставка по России",
  "yataxi:express": "Доставка в тот же день",
  // Service for light same-day parcels — not Yandex's product word «Курьер».
  "yataxi:courier": "Доставка лёгких посылок в тот же день",
  // Service name, not a speed — per-offer tariff arrives as serviceName.
  "cdek:delivery": "Доставка по России",
};

/** Same default key resolveOrderAdapter uses for null/unknown. */
export const DEFAULT_ORDER_ADAPTER_KEY = "yataxi:next_day";

/**
 * Resolve the service title a seller should see.
 * Null/empty/unknown key → default entry (same rule as resolveOrderAdapter).
 */
export function orderAdapterSellerTitle(
  adapterKey: string | null | undefined,
): string {
  if (adapterKey == null || adapterKey === "") {
    return ORDER_ADAPTER_SELLER_TITLES[DEFAULT_ORDER_ADAPTER_KEY]!;
  }
  // OWN keys only. A plain index walks the prototype chain, so "constructor",
  // "toString" and friends resolved to a truthy Object.prototype member, the
  // `=== undefined` check below never fired, and this returned a function where
  // a title belongs. Same guard as getOrderAdapter.
  // .call, not Object.hasOwn: this file ships in the browser bundle, and a
  // missing ES2022 method (Safari 15.4+) is a TypeError that kills the bundle,
  // not a degraded lookup — so the older form costs nothing and risks nothing.
  // Server code keeps Object.hasOwn (order-adapters.ts), client code uses .call
  // (pickup-point-adapters.ts, verify-credentials-adapters.ts): the repo's own
  // split, not a mixture.
  const found = Object.prototype.hasOwnProperty.call(
    ORDER_ADAPTER_SELLER_TITLES,
    adapterKey,
  )
    ? ORDER_ADAPTER_SELLER_TITLES[adapterKey]
    : undefined;
  if (found === undefined) {
    console.error(
      "[order-adapter-seller-titles] UNKNOWN_ORDER_ADAPTER_KEY",
      JSON.stringify({ adapterKey }),
    );
    return ORDER_ADAPTER_SELLER_TITLES[DEFAULT_ORDER_ADAPTER_KEY]!;
  }
  return found;
}
