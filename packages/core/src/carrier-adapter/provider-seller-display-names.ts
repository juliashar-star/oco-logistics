import { CARRIER_REGISTRY } from "../carrier-picker/registry";

/**
 * Seller-facing masked carrier names.
 * Single source for providerKey → masked string — do not hardcode these in components.
 */
export const PROVIDER_SELLER_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  yataxi: "Перевозчик №1",
};

/**
 * Resolve the name a seller should see for a carrier.
 * Mask map first; if no entry, fall back to CARRIER_REGISTRY.displayName (real name).
 */
export function providerSellerDisplayName(
  providerKey: string,
): string | undefined {
  const masked = PROVIDER_SELLER_DISPLAY_NAMES[providerKey];
  if (masked !== undefined) return masked;
  return CARRIER_REGISTRY.find((c) => c.providerKey === providerKey)?.displayName;
}
