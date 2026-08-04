/**
 * Shared CDEK { city, address } pair for calculator and order create.
 *
 * Quote (getOffers) and order (buildCdekOrderBody) must describe the same place
 * for the same shipment — if each had its own copy of the fallback rule, a
 * quote could succeed and the order fail on an empty/whitespace address
 * (measured: CDEK 400 when the location has no usable address). That is why
 * this lives in one helper rather than being duplicated.
 */
export function buildCdekLocation(
  city: string,
  addressString: string | null | undefined,
): { city: string; address: string } {
  const trimmedCity = city.trim();
  const trimmedAddress =
    typeof addressString === "string" ? addressString.trim() : "";
  return {
    city: trimmedCity,
    address: trimmedAddress.length > 0 ? trimmedAddress : trimmedCity,
  };
}
