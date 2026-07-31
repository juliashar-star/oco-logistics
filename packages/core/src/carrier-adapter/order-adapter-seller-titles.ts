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
  const found = ORDER_ADAPTER_SELLER_TITLES[adapterKey];
  if (found === undefined) {
    console.error(
      "[order-adapter-seller-titles] UNKNOWN_ORDER_ADAPTER_KEY",
      JSON.stringify({ adapterKey }),
    );
    return ORDER_ADAPTER_SELLER_TITLES[DEFAULT_ORDER_ADAPTER_KEY]!;
  }
  return found;
}
