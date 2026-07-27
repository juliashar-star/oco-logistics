import type {
  CarrierCreateOrderInput,
  CarrierCredentials,
  CarrierOffer,
  CarrierOffersResult,
  CarrierOrderItem,
} from "@oco/core/carrier-adapter/types";
import {
  assertYandexCredentials,
  resolveBaseUrl,
  yandexPost,
} from "./transport";

/**
 * Compose a claims/* route_points[].fullname from city + addressString.
 * Avoids "Москва, Москва" when addressString equals or already starts with the city.
 * Falls back to the city alone when addressString is absent.
 */
export function composeExpressRouteFullname(
  city: string,
  addressString?: string | null,
): string {
  const cityTrim = city.trim();
  const address = addressString?.trim();
  if (!address) {
    return cityTrim;
  }
  const cityLower = cityTrim.toLowerCase();
  const addressLower = address.toLowerCase();
  if (addressLower === cityLower || addressLower.startsWith(cityLower)) {
    return address;
  }
  return `${cityTrim}, ${address}`;
}

/**
 * Convert a neutral order item's centimetres / grams into Express metres / kilograms.
 */
export function convertNeutralItemToExpressMeasures(item: {
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  weightG: number;
}): { length: number; width: number; height: number; weight: number } {
  if (item.lengthCm === undefined) {
    throw new Error("Yandex Express item missing lengthCm");
  }
  if (item.widthCm === undefined) {
    throw new Error("Yandex Express item missing widthCm");
  }
  if (item.heightCm === undefined) {
    throw new Error("Yandex Express item missing heightCm");
  }
  return {
    length: item.lengthCm / 100,
    width: item.widthCm / 100,
    height: item.heightCm / 100,
    weight: item.weightG / 1000,
  };
}

type ExpressOfferPrice = {
  total_price?: string;
  total_price_with_vat?: string;
};

/**
 * Yandex quotes tariff prices NET of VAT (stated in the cabinet's Express tariff page),
 * and the other family's pricing_total is net too, so the net total_price is the
 * comparable figure.
 * If OCO ever shows prices WITH VAT, that belongs at the display layer applied to every
 * carrier uniformly, never inside one adapter.
 */
function selectExpressOfferPriceRub(price: ExpressOfferPrice): number {
  const raw = price.total_price;
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("Yandex Express offer missing price.total_price");
  }
  // Bare numeric string (e.g. "547.78") — parseRublePrice requires a "… RUB" suffix.
  const value = Number(raw.trim());
  if (!Number.isFinite(value)) {
    throw new Error(
      `Yandex Express offer unusable total_price: "${raw}"`,
    );
  }
  return value;
}

type ExpressInterval = {
  from?: string;
  to?: string;
};

type ExpressOffer = {
  payload?: string;
  offer_ttl?: string;
  delivery_interval?: ExpressInterval;
  pickup_interval?: ExpressInterval;
  price?: ExpressOfferPrice;
  taxi_class?: string;
  description?: string;
};

const NO_DELIVERY_CODES = new Set([
  "estimating.zone_unavailable",
  "estimating.tariff.not_available_in_zone",
  "address_outside_delivery_zone",
]);

function mapExpressOffer(raw: ExpressOffer): CarrierOffer | null {
  const offerId = raw.payload?.trim() ?? "";
  if (!offerId) {
    return null;
  }
  const delivery = raw.delivery_interval ?? {};
  const pickup = raw.pickup_interval ?? {};
  const price = raw.price ?? {};

  return {
    offerId,
    expiresAt: raw.offer_ttl ?? "",
    deliveryIntervalFrom: delivery.from ?? "",
    deliveryIntervalTo: delivery.to ?? "",
    pickupIntervalFrom: pickup.from ?? "",
    pickupIntervalTo: pickup.to ?? "",
    priceRub: selectExpressOfferPriceRub(price),
    rawOffer: raw,
  };
}

function buildCalculateBody(input: CarrierCreateOrderInput): Record<string, unknown> {
  const items = input.items.map((item: CarrierOrderItem) => {
    const measures = convertNeutralItemToExpressMeasures(item);
    return {
      quantity: item.quantity,
      size: {
        length: measures.length,
        width: measures.width,
        height: measures.height,
      },
      weight: measures.weight,
      pickup_point: 1,
      dropoff_point: 2,
    };
  });

  return {
    items,
    route_points: [
      {
        id: 1,
        fullname: composeExpressRouteFullname(
          input.sender.city,
          input.sender.addressString,
        ),
      },
      {
        id: 2,
        fullname: composeExpressRouteFullname(
          input.recipient.city,
          input.recipient.addressString,
        ),
      },
    ],
    requirements: { taxi_classes: ["express"] },
  };
}

/**
 * POST /b2b/cargo/integration/v2/offers/calculate — Express (claims/*) offers.
 * Same result shape as CarrierAdapter["getOffers"]; not wired into a registry yet.
 */
export async function getExpressOffers(
  input: CarrierCreateOrderInput,
  credentials: CarrierCredentials,
): Promise<CarrierOffersResult> {
  // Schema fact from the OpenAPI RoutePointWithAddress / claims calculate contract:
  // a pickup-point destination cannot be expressed at all (no platform_station /
  // point-id field on the calculate route point). This is not a sandbox observation
  // — do not "fix" it by probing geography or inventing a station mapping here.
  if (input.pointOutId?.trim()) {
    return { ok: false, reason: "no_delivery_options" };
  }

  const creds = assertYandexCredentials(credentials);
  const baseUrl = resolveBaseUrl("YANDEX_EXPRESS_BASE_URL");
  const body = buildCalculateBody(input);

  const response = await yandexPost(
    baseUrl,
    creds,
    "/b2b/cargo/integration/v2/offers/calculate",
    body,
  );
  const rawText = await response.text();
  let raw: unknown;
  try {
    raw = JSON.parse(rawText) as unknown;
  } catch {
    raw = rawText;
  }

  // Key on the provider CODE, not the HTTP status — same as getOffers /
  // no_delivery_options.
  if (
    raw !== null &&
    typeof raw === "object" &&
    "code" in raw &&
    typeof (raw as { code: unknown }).code === "string" &&
    NO_DELIVERY_CODES.has((raw as { code: string }).code)
  ) {
    return { ok: false, reason: "no_delivery_options" };
  }

  if (response.status !== 200) {
    throw new Error(
      `Yandex Express get offers failed: HTTP ${response.status} ${rawText}`,
    );
  }

  const offersRaw =
    raw !== null && typeof raw === "object" && "offers" in raw
      ? (raw as { offers: unknown }).offers
      : undefined;
  if (!Array.isArray(offersRaw)) {
    throw new Error(
      "Yandex Express get offers failed: malformed response (offers missing or not an array)",
    );
  }

  if (offersRaw.length === 0) {
    return { ok: false, reason: "no_delivery_options" };
  }

  const offers = (offersRaw as ExpressOffer[])
    .map(mapExpressOffer)
    .filter((offer): offer is CarrierOffer => offer !== null);

  return { ok: true, offers };
}
