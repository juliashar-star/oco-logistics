import type { OrderAdapter } from "./order-adapters";
import type { CarrierCredentials } from "./types";

export type SelectedOrderAdapter = {
  adapter: OrderAdapter;
  credentials: CarrierCredentials;
};

/**
 * Keep order-path adapters whose providerKey is among connected carriers,
 * pairing each with that provider's credentials. Order of `adapters` is
 * preserved; duplicate connected keys keep the first credentials only.
 */
export function selectOrderAdaptersForConnectedCarriers(
  adapters: OrderAdapter[],
  connected: { providerKey: string; credentials: CarrierCredentials }[],
): SelectedOrderAdapter[] {
  const credentialsByProvider = new Map<string, CarrierCredentials>();
  for (const entry of connected) {
    if (!credentialsByProvider.has(entry.providerKey)) {
      credentialsByProvider.set(entry.providerKey, entry.credentials);
    }
  }

  const selected: SelectedOrderAdapter[] = [];
  for (const adapter of adapters) {
    const credentials = credentialsByProvider.get(adapter.providerKey);
    if (credentials !== undefined) {
      selected.push({ adapter, credentials });
    }
  }
  return selected;
}
