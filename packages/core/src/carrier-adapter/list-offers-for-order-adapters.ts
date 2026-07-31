import { CarrierAuthError } from "./errors";
import { dedupeOffersBySameProviderInterval } from "./dedupe-offers-by-same-provider-interval";
import type { OrderAdapter } from "./order-adapters";
import { sortOffersForSeller } from "./sort-offers-for-seller";
import type {
  CarrierCreateOrderInput,
  CarrierCredentials,
  CarrierOffer,
} from "./types";

export type OrderAdapterOffersStatus =
  | "ok"
  | "no_delivery_options"
  | "auth_failed"
  | "timed_out"
  | "failed";

export type OrderAdapterOffersEntry = {
  key: string;
  status: OrderAdapterOffersStatus;
};

export type ListOffersForOrderAdaptersResult = {
  offers: CarrierOffer[];
  adapters: OrderAdapterOffersEntry[];
};

export type ListOffersForOrderAdaptersOptions = {
  /** Per-adapter wall clock; overdue → status timed_out. Worst case is the max, not the sum. */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;

class AdapterTimeoutError extends Error {
  constructor() {
    super("adapter_timed_out");
    this.name = "AdapterTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AdapterTimeoutError());
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function runOneAdapter(
  adapter: OrderAdapter,
  input: CarrierCreateOrderInput,
  credentials: CarrierCredentials,
  timeoutMs: number,
): Promise<{ entry: OrderAdapterOffersEntry; offers: CarrierOffer[] }> {
  try {
    const result = await withTimeout(
      adapter.getOffers(
        { ...input, providerKey: adapter.providerKey },
        credentials,
      ),
      timeoutMs,
    );
    if (!result.ok) {
      return {
        entry: { key: adapter.key, status: "no_delivery_options" },
        offers: [],
      };
    }
    return {
      entry: { key: adapter.key, status: "ok" },
      offers: result.offers.map((offer) => ({
        ...offer,
        adapterKey: adapter.key,
      })),
    };
  } catch (error) {
    // Status carries no provider text and never reaches the client. Logging
    // error server-side is deliberate (same as before this slice). Whether
    // provider responses should be redacted in logs is an OPEN question,
    // decided separately. Do not log input — it holds recipient PII.
    if (error instanceof AdapterTimeoutError) {
      console.error(
        "[listOffersForOrderAdapters] adapter timed out",
        adapter.key,
        error,
      );
      return { entry: { key: adapter.key, status: "timed_out" }, offers: [] };
    }
    if (error instanceof CarrierAuthError) {
      console.error(
        "[listOffersForOrderAdapters] adapter auth failed",
        adapter.key,
        error,
      );
      return { entry: { key: adapter.key, status: "auth_failed" }, offers: [] };
    }
    console.error(
      "[listOffersForOrderAdapters] adapter failed",
      adapter.key,
      error,
    );
    return { entry: { key: adapter.key, status: "failed" }, offers: [] };
  }
}

/**
 * Fetch priced offers from injectable order adapters in parallel.
 *
 * The single CarrierCredentials argument is an INTERMEDIATE shape, correct
 * only while every registered adapter shares one providerKey; a second
 * carrier needs per-carrier credentials, which is its own slice.
 *
 * Per-adapter: ok / no_delivery_options / auth_failed / timed_out / failed —
 * a throw or timeout never fails the whole call (same isolation as
 * listPickupPointsForCompany). Offers are tagged with the producing entry's
 * key. Status objects carry no provider text.
 *
 * After fan-out concatenates: same-provider same-interval duplicates are
 * collapsed (interval bounds floored to the UTC minute; cheapest kept;
 * wider offerLimitCapacity breaks a price tie), then sorted for the seller.
 */
export async function listOffersForOrderAdapters(
  input: CarrierCreateOrderInput,
  credentials: CarrierCredentials,
  adapters: OrderAdapter[],
  options?: ListOffersForOrderAdaptersOptions,
): Promise<ListOffersForOrderAdaptersResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const settled = await Promise.all(
    adapters.map((adapter) =>
      runOneAdapter(adapter, input, credentials, timeoutMs),
    ),
  );

  const offers: CarrierOffer[] = [];
  const entries: OrderAdapterOffersEntry[] = [];
  for (const row of settled) {
    entries.push(row.entry);
    offers.push(...row.offers);
  }

  const providerKeyByAdapterKey = new Map(
    adapters.map((adapter) => [adapter.key, adapter.providerKey] as const),
  );
  const capacityByAdapterKey = new Map(
    adapters
      .filter((adapter) => adapter.offerLimitCapacity !== undefined)
      .map(
        (adapter) =>
          [adapter.key, adapter.offerLimitCapacity as number] as const,
      ),
  );

  const deduped = dedupeOffersBySameProviderInterval(offers, {
    providerKeyOf: (adapterKey) =>
      adapterKey === undefined
        ? undefined
        : providerKeyByAdapterKey.get(adapterKey),
    serviceLimitCapacityOf: (adapterKey) =>
      adapterKey === undefined
        ? undefined
        : capacityByAdapterKey.get(adapterKey),
  });

  return { offers: sortOffersForSeller(deduped), adapters: entries };
}
