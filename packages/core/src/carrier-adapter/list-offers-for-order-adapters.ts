import { CarrierAuthError } from "./errors";
import { dedupeOffersBySameProviderInterval } from "./dedupe-offers-by-same-provider-interval";
import type { OrderAdapter } from "./order-adapters";
import { parcelFitsServiceLimits } from "./parcel-fits-service-limits";
import type { SelectedOrderAdapter } from "./select-order-adapters-for-connected-carriers";
import { sortOffersForSeller } from "./sort-offers-for-seller";
import type {
  CarrierCreateOrderInput,
  CarrierCredentials,
  CarrierOffer,
} from "./types";

export type OrderAdapterOffersStatus =
  | "ok"
  | "no_delivery_options"
  | "parcel_too_large"
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

/**
 * Whether this service's declared limits accept this parcel — ONE rule for every
 * carrier, applied before the call rather than inside each adapter.
 *
 * NO DECLARED LIMITS → ALWAYS TRUE. An absent `parcelLimits` means we hold no
 * sourced number for that service, never that it carries anything. Filtering on
 * a guess would hide an option the seller could have bought.
 *
 * `parcelLimitsPointOnly` narrows a service whose numbers are sourced only for a
 * pickup-point destination; with a courier destination it does not filter. See
 * the field's comment in order-adapters.ts for whose numbers those are and why
 * the courier branch is left open deliberately.
 */
function adapterAcceptsParcel(
  adapter: OrderAdapter,
  input: CarrierCreateOrderInput,
): boolean {
  const limits = adapter.parcelLimits;
  if (limits === undefined) {
    return true;
  }

  const toPoint = (input.pointOutId ?? "").trim() !== "";

  // THE INSURMOUNTABLE REASON WINS OVER THE FIXABLE ONE, and the order is the
  // whole point of this branch. A service that cannot deliver to a pickup point
  // at all will NEVER appear on this route, whatever the parcel weighs. Telling
  // the seller «не принимает посылку такого веса или размера» would be true and
  // useless: they would go and shrink a parcel to make a service appear that
  // cannot appear. So we decline to pre-empt the destination refusal with a
  // size one — the adapter answers for itself, and its answer is the better of
  // the two. Both statements are true; only one is worth acting on.
  if (toPoint && adapter.servesPointDestination === false) {
    return true;
  }

  if (adapter.parcelLimitsPointOnly === true && !toPoint) {
    return true;
  }
  return parcelFitsServiceLimits(input.items, limits);
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
 * Each SelectedOrderAdapter carries its own credentials — one bag per
 * provider entry, so a second carrier can pass distinct credentials.
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
  selected: SelectedOrderAdapter[],
  options?: ListOffersForOrderAdaptersOptions,
): Promise<ListOffersForOrderAdaptersResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const settled = await Promise.all(
    selected.map(({ adapter, credentials }) => {
      // BEFORE THE CALL, not after: a service that cannot carry this parcel is
      // not asked at all. Its own status says so, distinctly from an adapter
      // that answered and had nothing — the seller can act on one and not the
      // other.
      if (!adapterAcceptsParcel(adapter, input)) {
        return Promise.resolve({
          entry: {
            key: adapter.key,
            status: "parcel_too_large" as const,
          },
          offers: [] as CarrierOffer[],
        });
      }
      return runOneAdapter(adapter, input, credentials, timeoutMs);
    }),
  );

  const offers: CarrierOffer[] = [];
  const entries: OrderAdapterOffersEntry[] = [];
  for (const row of settled) {
    entries.push(row.entry);
    offers.push(...row.offers);
  }

  const adapters = selected.map((entry) => entry.adapter);
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
