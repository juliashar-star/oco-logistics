/**
 * Seller-facing masked carrier names for operational UI (shipments list/export).
 * Single source for providerKey → display string — do not hardcode these in components.
 */
export const PROVIDER_SELLER_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  yataxi: "Перевозчик №1",
};

export function providerSellerDisplayName(
  providerKey: string,
): string | undefined {
  return PROVIDER_SELLER_DISPLAY_NAMES[providerKey];
}
