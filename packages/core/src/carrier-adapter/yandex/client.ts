import type {
  CarrierCalculateInput,
  CarrierCredentials,
  CarrierDeliveryQuote,
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
