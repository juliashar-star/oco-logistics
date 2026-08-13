import { CARRIER_REGISTRY } from "../carrier-picker/registry";

/**
 * Seller-facing masked carrier names.
 * Single source for providerKey → masked string — do not hardcode these in components.
 */
export const PROVIDER_SELLER_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  yataxi: "Перевозчик №1",
  // yataxi is masked; leaving cdek on its real registry name would name one
  // carrier while masking the other, and public carrier naming is still an
  // open legal question.
  cdek: "Перевозчик №2",
};

/**
 * Resolve the name a seller should see for a carrier.
 * Mask map first; if no entry, fall back to CARRIER_REGISTRY.displayName (real name).
 */
export function providerSellerDisplayName(
  providerKey: string,
): string | undefined {
  // OWN keys only. Unguarded, a prototype name came back as a truthy member and
  // callers rendered it where a masked carrier name belongs.
  const masked = Object.prototype.hasOwnProperty.call(
    PROVIDER_SELLER_DISPLAY_NAMES,
    providerKey,
  )
    ? PROVIDER_SELLER_DISPLAY_NAMES[providerKey]
    : undefined;
  if (masked !== undefined) return masked;
  return CARRIER_REGISTRY.find((c) => c.providerKey === providerKey)?.displayName;
}
