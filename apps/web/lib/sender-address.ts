/**
 * APIShip ожидает addressString в виде «Город, улица, дом».
 * Город в настройках и строка адреса хранятся отдельно — склеиваем для калькулятора.
 */
export function formatAddressForApiship(
  city: string,
  addressLine?: string | null,
): string | undefined {
  const cityTrim = city.trim();
  const address = addressLine?.trim();
  if (!cityTrim || !address) {
    return undefined;
  }

  const cityLower = cityTrim.toLowerCase();
  if (address.toLowerCase().includes(cityLower)) {
    return address;
  }

  return `${cityTrim}, ${address}`;
}

export type SenderFields = {
  senderCity: string | null;
  senderAddress: string | null;
};

export function resolveSenderLocation(company: SenderFields): {
  city: string;
  addressString?: string;
} | null {
  const city = company.senderCity?.trim();
  if (!city) {
    return null;
  }

  const addressString = formatAddressForApiship(city, company.senderAddress);
  return {
    city,
    ...(addressString ? { addressString } : {}),
  };
}
