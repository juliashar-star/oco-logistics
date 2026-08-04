import type {
  CarrierCreateOrderInput,
  CarrierCredentials,
  CarrierListPointsInput,
  CarrierListPointsResult,
  CarrierOffersResult,
  CarrierOrderItem,
  CarrierPickupPoint,
} from "../types";
import { buildCdekLocation } from "./build-cdek-location";
import {
  type CdekCity,
  resolveCdekCities,
} from "./cities";
import { cdekDeliveryMode } from "./delivery-mode";
import { mapCdekTariffsToOffers } from "./map-cdek-tariffs";
import {
  acceptsHandout,
  isActiveOffice,
  mapCdekPickupPoints,
  normaliseForRegionCompare,
} from "./map-pickup-points";
import {
  assertCdekCredentials,
  cdekGet,
  cdekPost,
  resolveBaseUrl,
} from "./transport";

/**
 * Cap on how many /v2/location/cities matches we will fan out into office
 * list calls. Measured ambiguity is 1–2; beyond a handful we genuinely cannot
 * tell which city the seller means, and fanning out further would cost an
 * interactive request dearly. Zero or more than this → city_not_resolved,
 * with no office request.
 */
export const CDEK_LIST_PICKUP_POINTS_MAX_CITY_MATCHES = 5;

/**
 * Destination side of delivery_mode — same rule as Yandex
 * assertCreateOrderPreconditions: CarrierCreateOrderInput has no pickupType,
 * so pointOutId (trimmed) means PVZ; otherwise the destination is a door
 * address (COURIER). pointOutId wins when both are set.
 */
function pickupTypeFromInput(
  input: CarrierCreateOrderInput,
): "PVZ" | "COURIER" {
  return input.pointOutId?.trim() ? "PVZ" : "COURIER";
}

function buildPackage(item: CarrierOrderItem): {
  weight: number;
  length?: number;
  width?: number;
  height?: number;
} {
  const pkg: {
    weight: number;
    length?: number;
    width?: number;
    height?: number;
  } = { weight: item.weightG };
  if (item.lengthCm !== undefined) pkg.length = item.lengthCm;
  if (item.widthCm !== undefined) pkg.width = item.widthCm;
  if (item.heightCm !== undefined) pkg.height = item.heightCm;
  return pkg;
}

/**
 * POST /v2/calculator/tarifflist — quote half only. Not registered in
 * ORDER_ADAPTERS yet; nothing calls this from the live order path.
 */
export async function getOffers(
  input: CarrierCreateOrderInput,
  credentials: CarrierCredentials,
): Promise<CarrierOffersResult> {
  const creds = assertCdekCredentials(credentials);
  const baseUrl = resolveBaseUrl("CDEK_BASE_URL");
  const pickupType = pickupTypeFromInput(input);
  const deliveryMode = cdekDeliveryMode(input.handoverMode, pickupType);

  // One package from the single synthetic item OCO builds (weight in grams).
  const item = input.items[0];
  if (!item) {
    throw new Error("CDEK_INPUT_INVALID: at least one item is required");
  }
  const body = {
    type: Number(creds.contractType),
    currency: 1,
    lang: "rus",
    // Same helper as buildCdekOrderBody — quote and order must agree on place.
    from_location: buildCdekLocation(
      input.sender.city,
      input.sender.addressString,
    ),
    to_location: buildCdekLocation(
      input.recipient.city,
      input.recipient.addressString,
    ),
    packages: [buildPackage(item)],
  };

  const response = await cdekPost(
    baseUrl,
    creds,
    "/v2/calculator/tarifflist",
    body,
  );

  if (!response.ok) {
    // Status only — never the body (may echo credentials or PII).
    throw new Error(`CDEK get offers failed: HTTP ${response.status}`);
  }

  const json: unknown = await response.json();
  const offers = mapCdekTariffsToOffers(json, deliveryMode);

  if (offers.length === 0) {
    return { ok: false, reason: "no_delivery_options" };
  }
  return { ok: true, offers };
}

/**
 * One label for a matched CDEK city in resolvedLocation.address: city alone
 * when region equals city under the same normalisation as the city cache;
 * otherwise `${city}, ${region}`.
 */
function formatResolvedCityLabel(match: CdekCity): string {
  // parseCdekCities falls back to region: "" when absent; do not emit
  // «Москва, » (trailing comma) into the seller-facing empty-state line.
  if (typeof match.region !== "string" || match.region.trim().length === 0) {
    return match.city;
  }
  if (
    normaliseForRegionCompare(match.region) ===
    normaliseForRegionCompare(match.city)
  ) {
    return match.city;
  }
  return `${match.city}, ${match.region}`;
}

/**
 * GET /v2/deliverypoints for every matched city_code — not registered in
 * PICKUP_POINT_ADAPTERS yet; nothing calls this from the live order path.
 */
export async function listPickupPoints(
  input: CarrierListPointsInput,
  credentials: CarrierCredentials,
): Promise<CarrierListPointsResult> {
  const creds = assertCdekCredentials(credentials);
  const baseUrl = resolveBaseUrl("CDEK_BASE_URL");

  const matches = await resolveCdekCities(input.city, credentials);
  if (
    matches.length === 0 ||
    matches.length > CDEK_LIST_PICKUP_POINTS_MAX_CITY_MATCHES
  ) {
    return { ok: false, reason: "city_not_resolved" };
  }

  // ALL-OR-NOTHING: if any sub-request is non-2xx or throws, throw — status
  // only, never the body. A PARTIAL list is a silently wrong answer, because
  // the office the seller wants may be in the half that failed.
  const officeArrays = await Promise.all(
    matches.map(async (match) => {
      const path =
        `/v2/deliverypoints?city_code=${match.code}&is_handout=true`;
      const response = await cdekGet(baseUrl, creds, path);
      if (!response.ok) {
        throw new Error(
          `CDEK pickup points list failed: HTTP ${response.status}`,
        );
      }
      const json: unknown = await response.json();
      // Do NOT pass a non-array to mapCdekPickupPoints — that mapper returns
      // [] for a non-array and would turn a broken reply into an
      // honest-looking "no offices in this city".
      if (!Array.isArray(json)) {
        throw new Error(
          "CDEK pickup points list failed: malformed response",
        );
      }
      return json as unknown[];
    }),
  );

  const points: CarrierPickupPoint[] = [];
  const seenIds = new Set<string>();
  for (const rawOffices of officeArrays) {
    const filtered = rawOffices.filter(
      (row) => isActiveOffice(row) && acceptsHandout(row),
    );
    for (const point of mapCdekPickupPoints(filtered)) {
      if (seenIds.has(point.id)) {
        continue;
      }
      seenIds.add(point.id);
      points.push(point);
    }
  }

  return {
    ok: true,
    // CDEK's resolvedLocation.id may be a LIST of city codes joined by ",";
    // anything wanting to parse it as one place id must revisit this.
    // (Nothing reads it today — verified.)
    resolvedLocation: {
      id: matches.map((match) => String(match.code)).join(","),
      address: matches.map(formatResolvedCityLabel).join(" / "),
    },
    points,
  };
}
