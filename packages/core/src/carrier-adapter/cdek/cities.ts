import type { CarrierCredentials } from "../types";
import {
  assertCdekCredentials,
  cdekGet,
  resolveBaseUrl,
} from "./transport";

export type CdekCity = {
  code: number;
  city: string;
  region: string;
};

type CityCacheEntry = {
  cities: CdekCity[];
  expiresAtMs: number;
};

/**
 * TTL for the city-code cache.
 *
 * 24 h: city codes are public reference data that change rarely (rename /
 * merge), so a day of reuse cuts parallel fan-out load without pretending
 * the list is permanent. Unlike the APIShip token cache — which holds tokens
 * forever and is a recorded defect — this ALWAYS expires via an injected
 * clock (`now`), so tests can advance past the TTL and production cannot
 * pin a stale entry forever.
 */
export const CDEK_CITY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Cache key is `${baseUrl}\0${normalisedName}` — NOT the account.
 * City codes are public reference data; the account-keyed rule on the OAuth
 * token cache exists to stop cross-tenant CREDENTIAL leakage and does not
 * apply here. Do not "fix" this to include account.
 */
const cityCache = new Map<string, CityCacheEntry>();

/**
 * In-flight lookups for the same key share one Promise so parallel fan-out
 * does not stampede /v2/location/cities. Cleared on settle (success or
 * failure) so a rejected promise never poisons the next call — same shape
 * as fetchCdekToken's inflight map.
 */
const cityInflight = new Map<string, Promise<CdekCity[]>>();

function cityCacheKey(baseUrl: string, normalisedName: string): string {
  return `${baseUrl}\u0000${normalisedName}`;
}

/**
 * Cache-key normalisation only — the wire still receives the trimmed
 * seller-facing spelling. trim + lowercase (ru-RU) + ё→е so «Королёв»,
 * «Королев» and «королев» share ONE entry (measured on edu).
 */
export function normaliseCdekCityName(name: string): string {
  return name.trim().toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
}

/**
 * Number leniency matching map-pickup-points.ts `finiteNumber`: accept a
 * finite number or a numeric string («44» → 44). Deliberate DUPLICATE — a
 * shared cdek/parse.ts waits for a THIRD use; extracting on the second would
 * be premature. Rejecting a city code fails SILENTLY (seller sees no CDEK
 * points while Yandex points still appear), so leniency is the safe side.
 */
function finiteCityCode(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Parse a bare CDEK /v2/location/cities JSON array into { code, city, region }[].
 *
 * WHY SKIP RATHER THAN THROW: same reasoning as mapCdekPickupPoints — one
 * malformed row must not blank a usable reply.
 * region falls back to "" when absent or not a string.
 */
export function parseCdekCities(raw: unknown): CdekCity[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const cities: CdekCity[] = [];
  for (const element of raw) {
    if (element === null || typeof element !== "object") {
      continue;
    }
    const row = element as Record<string, unknown>;
    const code = finiteCityCode(row.code);
    if (code === null) {
      continue;
    }
    if (typeof row.city !== "string" || row.city.trim().length === 0) {
      continue;
    }
    const region =
      typeof row.region === "string" ? row.region : "";
    cities.push({
      code,
      city: row.city,
      region,
    });
  }
  return cities;
}

/**
 * Resolve CDEK city codes for a city name via GET /v2/location/cities.
 *
 * Returns EVERY matching row the provider sent — does NOT cap, filter, or
 * rank them. Choosing among ambiguous hits (e.g. «Ростов» vs «Ростов-на-Дону»
 * when the seller typed something else, or two «Москва» rows) is the
 * CALLER's job.
 *
 * Only successful HTTP 200 replies are cached (including an empty array).
 * Thrown errors are never cached.
 */
export async function resolveCdekCities(
  cityName: string,
  credentials: CarrierCredentials,
  now: () => number = Date.now,
): Promise<CdekCity[]> {
  const trimmed = cityName.trim();
  // Same guard shape as getOffers' empty-items check: no network for nothing.
  if (!trimmed) {
    return [];
  }

  const creds = assertCdekCredentials(credentials);
  const baseUrl = resolveBaseUrl("CDEK_BASE_URL");
  const key = cityCacheKey(baseUrl, normaliseCdekCityName(trimmed));

  const cached = cityCache.get(key);
  if (cached && now() < cached.expiresAtMs) {
    return cached.cities;
  }

  const pending = cityInflight.get(key);
  if (pending) {
    return pending;
  }

  const promise = (async () => {
    const pathWithQuery =
      "/v2/location/cities?country_codes=RU&city=" +
      encodeURIComponent(trimmed);
    const response = await cdekGet(baseUrl, creds, pathWithQuery);

    if (!response.ok) {
      // Status only — never the body (may echo submitted fields).
      throw new Error(`CDEK cities lookup failed: HTTP ${response.status}`);
    }

    const json: unknown = await response.json();
    const cities = parseCdekCities(json);
    // WHY freeze: the cache is process-wide and cross-tenant by design
    // (public reference data, keyed by baseUrl+name — not account). Returning
    // the cached array itself means every caller shares one mutable object;
    // a sort/splice on one company's path would corrupt the entry for every
    // other tenant. Freeze each row AND the array — a shallow copy would
    // still leave the rows shared.
    for (const row of cities) {
      Object.freeze(row);
    }
    Object.freeze(cities);
    cityCache.set(key, {
      cities,
      expiresAtMs: now() + CDEK_CITY_CACHE_TTL_MS,
    });
    return cities;
  })().finally(() => {
    cityInflight.delete(key);
  });

  cityInflight.set(key, promise);
  return promise;
}
