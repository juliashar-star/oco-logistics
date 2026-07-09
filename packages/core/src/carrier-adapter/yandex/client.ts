import type {
  CarrierCalculateInput,
  CarrierCreateOrderInput,
  CarrierCredentials,
  CarrierDeliveryQuote,
  CarrierCreateOrderResult,
  CarrierListPointsInput,
  CarrierPickupPoint,
} from "@oco/core/carrier-adapter/types";
import { parseRublePrice } from "@oco/core/carrier-adapter/yandex/parse-price";

export class YandexAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YandexAuthError";
  }
}

type YandexCredentials = { platformStationId: string; token: string };

function assertYandexCredentials(creds: CarrierCredentials): YandexCredentials {
  const platformStationId = creds.platformStationId;
  const token = creds.token;
  if (!platformStationId || !token) {
    throw new Error("YANDEX_CREDENTIALS_INVALID: platformStationId and token are required");
  }
  return { platformStationId, token };
}

function getBaseUrl(): string {
  const baseUrl = process.env.YANDEX_DELIVERY_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error("YANDEX_DELIVERY_BASE_URL is not configured");
  }
  return baseUrl.replace(/\/$/, "");
}

async function yandexPost(
  creds: YandexCredentials,
  path: string,
  body: unknown,
): Promise<Response> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401 || response.status === 403) {
    throw new YandexAuthError(`Yandex Delivery auth failed: HTTP ${response.status}`);
  }

  return response;
}

type PricingCalculatorResponse = {
  pricing_total: string;
  delivery_days: number;
};

type YandexDestination =
  | { address: string }
  | { platform_station_id: string };

type LocationDetectResponse = {
  variants: Array<{ geo_id: number; address: string }>;
};

type YandexPickupPoint = {
  id: string;
  operator_station_id?: string;
  name: string;
  type: string;
  position: { latitude: number; longitude: number };
  address: { locality: string; full_address: string };
};

function mapPickupPoint(point: YandexPickupPoint): CarrierPickupPoint {
  return {
    id: point.id,
    providerKey: "yataxi",
    code: point.operator_station_id ?? point.id,
    name: point.name,
    address: point.address.full_address,
    city: point.address.locality,
    latitude: point.position.latitude,
    longitude: point.position.longitude,
    rawPoint: point,
  };
}

async function fetchQuote(
  tariff: "time_interval" | "self_pickup",
  input: CarrierCalculateInput,
  creds: YandexCredentials,
  destination: YandexDestination,
): Promise<CarrierDeliveryQuote | null> {
  const response = await yandexPost(creds, "/api/b2b/platform/pricing-calculator", {
    source: { platform_station_id: creds.platformStationId },
    destination,
    tariff,
    items: [
      {
        weight_kg: input.weightG / 1000,
        length_cm: input.lengthCm,
        width_cm: input.widthCm,
        height_cm: input.heightCm,
      },
    ],
  });

  if (!response.ok) {
    return null;
  }

  const raw = (await response.json()) as PricingCalculatorResponse;

  return {
    providerKey: "yataxi",
    tariffId: tariff,
    tariffName: tariff === "time_interval" ? "Курьером до двери" : "Самовывоз из ПВЗ",
    deliveryCostRub: parseRublePrice(raw.pricing_total),
    deliveryDaysMin: raw.delivery_days,
    deliveryDaysMax: raw.delivery_days,
    deliveryMode: tariff === "time_interval" ? "door" : "point",
    rawVariant: raw,
  };
}

export async function calculateQuotes(
  input: CarrierCalculateInput,
  credentials: CarrierCredentials,
): Promise<CarrierDeliveryQuote[]> {
  const creds = assertYandexCredentials(credentials);
  const tasks: Promise<CarrierDeliveryQuote | null>[] = [];

  if (input.to.addressString?.trim()) {
    const address = `${input.to.city}, ${input.to.addressString.trim()}`;
    tasks.push(fetchQuote("time_interval", input, creds, { address }));
  }

  if (input.pointOutId) {
    tasks.push(
      fetchQuote("self_pickup", input, creds, {
        platform_station_id: input.pointOutId,
      }),
    );
  }

  const results = await Promise.all(tasks);
  return results.filter((quote): quote is CarrierDeliveryQuote => quote !== null);
}

export async function listPickupPoints(
  input: CarrierListPointsInput,
  credentials: CarrierCredentials,
): Promise<CarrierPickupPoint[]> {
  const creds = assertYandexCredentials(credentials);

  const detectResponse = await yandexPost(creds, "/api/b2b/platform/location/detect", {
    location: input.city,
  });

  if (!detectResponse.ok) {
    throw new Error(`Yandex Delivery location detect failed: HTTP ${detectResponse.status}`);
  }

  const detect = (await detectResponse.json()) as LocationDetectResponse;
  if (detect.variants.length === 0) {
    return [];
  }

  const geoId = detect.variants[0].geo_id;

  const listResponse = await yandexPost(creds, "/api/b2b/platform/pickup-points/list", {
    geo_id: geoId,
    type: "pickup_point",
  });

  if (!listResponse.ok) {
    throw new Error(`Yandex Delivery pickup points list failed: HTTP ${listResponse.status}`);
  }

  const list = (await listResponse.json()) as { points: YandexPickupPoint[] };
  const mapped = (list.points ?? [])
    .filter((point) => point.type === "pickup_point")
    .map(mapPickupPoint);

  const offset = input.offset ?? 0;
  const end = input.limit !== undefined ? offset + input.limit : undefined;
  return mapped.slice(offset, end);
}

type YandexCreateOrderResponse = {
  request_id: string;
};

/** Lossy heuristic: Yandex requires separate first/last name; we only have one contactName string. */
function splitRecipientName(contactName: string): { firstName: string; lastName: string } {
  const trimmed = contactName.trim();
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) {
    return { firstName: trimmed, lastName: "-" };
  }
  return {
    firstName: trimmed.slice(0, spaceIndex),
    lastName: trimmed.slice(spaceIndex + 1).trim() || "-",
  };
}

/**
 * ⚠️ DO NOT WIRE THIS INTO ANY ROUTE YET — INCOMPLETE.
 *
 * This uses POST /request/create, which returns a request_id but
 * produces an order that CANNOT be confirmed: no confirm endpoint
 * accepts a request_id (verified 2026-07-09 against the test API —
 * request/confirm → 404, offers/confirm → offer_was_not_found).
 * Such orders never receive a state.status, a courier_order_id, or a
 * sharing_url. They will not ship.
 *
 * The real flow is two-phase:
 *   POST /offers/create  → offers[] (each with offer_id, expires_at,
 *                          delivery_interval, pricing)
 *   POST /offers/confirm → { request_id }   ← only now is it an order
 *
 * Rewriting this method onto the offers flow is the next slice.
 * The 11 tests below assert the CURRENT (wrong) request shape and will
 * need rewriting too — they pass because they test the code as written,
 * not the behavior we need.
 */
export async function createOrder(
  input: CarrierCreateOrderInput,
  credentials: CarrierCredentials,
): Promise<CarrierCreateOrderResult> {
  if (input.cod?.enabled) {
    throw new Error(
      "YANDEX_COD_NOT_SUPPORTED: cash on delivery requires partial-refusal flags not yet implemented",
    );
  }
  if (input.items.some((item) => item.markingCode)) {
    throw new Error(
      "YANDEX_MARKING_NOT_SUPPORTED: marking code format is not yet known for Yandex Delivery",
    );
  }
  if (input.items.length === 0) {
    throw new Error("YANDEX_NO_ITEMS: at least one item is required");
  }

  const addressString = input.recipient.addressString?.trim();
  if (!addressString) {
    throw new Error("YANDEX_NO_ADDRESS: recipient addressString is required");
  }

  const creds = assertYandexCredentials(credentials);

  const placeBarcode = `${input.clientNumber}-1`;
  const totalWeightG = input.items.reduce(
    (sum, item) => sum + item.weightG * item.quantity,
    0,
  );
  const boxDx = Math.max(...input.items.map((item) => item.lengthCm ?? 1));
  const boxDy = Math.max(...input.items.map((item) => item.widthCm ?? 1));
  const boxDz = Math.max(...input.items.map((item) => item.heightCm ?? 1));

  const { firstName, lastName } = splitRecipientName(input.recipient.contactName);

  const body = {
    info: { operator_request_id: input.clientNumber },
    source: { platform_station: { platform_id: creds.platformStationId } },
    destination: {
      type: "custom_location",
      custom_location: {
        details: {
          // Known open issue: Yandex FAQ expects comma-separated parts without postal
          // code or apartment number — we pass recipient input as-is without stripping.
          full_address: `${input.recipient.city}, ${addressString}`,
        },
      },
    },
    billing_info: { payment_method: "already_paid" },
    recipient_info: {
      first_name: firstName,
      last_name: lastName,
      phone: input.recipient.phone,
    },
    last_mile_policy: "time_interval",
    items: input.items.map((item) => ({
      count: item.quantity,
      name: item.name,
      article: item.name,
      billing_details: {
        unit_price: Math.round(item.unitPriceRub * 100),
        assessed_unit_price: Math.round(item.unitPriceRub * 100),
      },
      physical_dims: {
        dx: item.lengthCm ?? 1,
        dy: item.widthCm ?? 1,
        dz: item.heightCm ?? 1,
      },
      place_barcode: placeBarcode,
    })),
    places: [
      {
        barcode: placeBarcode,
        physical_dims: {
          weight_gross: totalWeightG,
          dx: boxDx,
          dy: boxDy,
          dz: boxDz,
        },
      },
    ],
  };

  const response = await yandexPost(creds, "/api/b2b/platform/request/create", body);
  const rawText = await response.text();
  let raw: unknown;
  try {
    raw = JSON.parse(rawText) as unknown;
  } catch {
    raw = rawText;
  }

  if (response.status === 200) {
    const data = raw as YandexCreateOrderResponse;
    return { orderId: data.request_id, isNewOrder: true, rawResponse: raw };
  }
  if (response.status === 208) {
    const data = raw as YandexCreateOrderResponse;
    return { orderId: data.request_id, isNewOrder: false, rawResponse: raw };
  }

  throw new Error(`Yandex Delivery create order failed: HTTP ${response.status} ${rawText}`);
}
