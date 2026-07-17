import type {
  CarrierCalculateInput,
  CarrierCancelOrderResult,
  CarrierConfirmResult,
  CarrierCreateOrderInput,
  CarrierCredentials,
  CarrierDeliveryQuote,
  CarrierCreateOrderResult,
  CarrierListPointsInput,
  CarrierListPointsResult,
  CarrierOffer,
  CarrierOffersResult,
  CarrierOrderHistoryResult,
  CarrierPickupPoint,
  CarrierTrackingEvent,
} from "@oco/core/carrier-adapter/types";
import { parseRublePrice } from "@oco/core/carrier-adapter/yandex/parse-price";

export class YandexAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YandexAuthError";
  }
}

/** Expired or otherwise invalid offer_id on offers/confirm (provider code offer_was_not_found). */
export class YandexOfferExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YandexOfferExpiredError";
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

/** GET counterpart to yandexPost — same auth throw on 401/403. Not reshaped from POST. */
async function yandexGet(
  creds: YandexCredentials,
  pathWithQuery: string,
): Promise<Response> {
  const response = await fetch(`${getBaseUrl()}${pathWithQuery}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${creds.token}`,
    },
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
): Promise<CarrierListPointsResult> {
  const creds = assertYandexCredentials(credentials);

  const detectResponse = await yandexPost(creds, "/api/b2b/platform/location/detect", {
    location: input.city,
  });

  if (!detectResponse.ok) {
    throw new Error(`Yandex Delivery location detect failed: HTTP ${detectResponse.status}`);
  }

  const detectRaw: unknown = await detectResponse.json();
  const variants =
    detectRaw !== null &&
    typeof detectRaw === "object" &&
    "variants" in detectRaw
      ? (detectRaw as { variants: unknown }).variants
      : undefined;
  if (!Array.isArray(variants)) {
    throw new Error(
      "Yandex Delivery location detect failed: malformed response (variants missing or not an array)",
    );
  }
  if (variants.length === 0) {
    return { ok: false, reason: "city_not_resolved" };
  }

  const firstVariant = variants[0];
  const geoId =
    firstVariant !== null &&
    typeof firstVariant === "object" &&
    "geo_id" in firstVariant
      ? (firstVariant as { geo_id: unknown }).geo_id
      : undefined;
  if (typeof geoId !== "number") {
    throw new Error(
      "Yandex Delivery location detect failed: malformed response (variants[0] missing usable geo_id)",
    );
  }
  const resolvedGeoId: LocationDetectResponse["variants"][number]["geo_id"] = geoId;

  const resolvedAddress =
    firstVariant !== null &&
    typeof firstVariant === "object" &&
    "address" in firstVariant
      ? (firstVariant as { address: unknown }).address
      : undefined;
  if (typeof resolvedAddress !== "string" || resolvedAddress.length === 0) {
    throw new Error(
      "Yandex Delivery location detect failed: malformed response (variants[0] missing usable address)",
    );
  }
  const resolvedLocationAddress: LocationDetectResponse["variants"][number]["address"] =
    resolvedAddress;

  // No type filter: production Moscow returned 544 of 3550 points (15%) as
  // type "terminal" — all «Постамат Яндекс Маркет». Parcel lockers are a real
  // collection destination the seller should be able to choose; not every item
  // needs trying on and not every buyer wants to. The provider's name already
  // distinguishes them, so nothing labels them here.
  const listResponse = await yandexPost(creds, "/api/b2b/platform/pickup-points/list", {
    geo_id: resolvedGeoId,
  });

  if (!listResponse.ok) {
    throw new Error(`Yandex Delivery pickup points list failed: HTTP ${listResponse.status}`);
  }

  const listRaw: unknown = await listResponse.json();
  const rawPoints =
    listRaw !== null && typeof listRaw === "object" && "points" in listRaw
      ? (listRaw as { points: unknown }).points
      : undefined;
  if (!Array.isArray(rawPoints)) {
    throw new Error(
      "Yandex Delivery pickup points list failed: malformed response (points missing or not an array)",
    );
  }
  const points = (rawPoints as YandexPickupPoint[]).map(mapPickupPoint);

  return {
    ok: true,
    resolvedLocation: { id: String(resolvedGeoId), address: resolvedLocationAddress },
    points,
  };
}

type YandexCreateOrderResponse = {
  request_id: string;
};

type YandexConfirmOfferResponse = {
  request_id?: string;
};

type YandexInterval = {
  min?: string | number;
  max?: string | number;
  policy?: string;
};

type YandexOfferDetails = {
  delivery_interval?: YandexInterval;
  pickup_interval?: YandexInterval;
  pricing?: string;
  pricing_total?: string;
};

type YandexOffer = {
  offer_id?: string;
  expires_at?: string;
  offer_details?: YandexOfferDetails;
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

type YandexDestinationChoice =
  | { kind: "pickup_point"; pointOutId: string }
  | { kind: "address"; addressString: string };

/**
 * Destination preconditions for offers/create (and the doomed request/create stub).
 * Old YANDEX_NO_ADDRESS lied to PVZ orders — a PVZ draft legitimately has no
 * address, and CarrierCreateOrderInput carries no pickupType so the adapter
 * cannot infer intent. ONLY place the destination choice is made.
 *
 * pointOutId wins when both set — more specific; create-draft sets destAddress
 * only for COURIER and pvzCode for PVZ. calculateQuotes returns BOTH quotes when
 * both inputs are set (comparison). getOffers cannot: offers/create is ONE
 * request with ONE destination, so it must choose.
 */
function assertCreateOrderPreconditions(
  input: CarrierCreateOrderInput,
): YandexDestinationChoice {
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

  const pointOutId = input.pointOutId?.trim();
  const addressString = input.recipient.addressString?.trim();

  if (pointOutId) {
    return { kind: "pickup_point", pointOutId };
  }
  if (addressString) {
    return { kind: "address", addressString };
  }
  throw new Error(
    "YANDEX_NO_DESTINATION: either a pickup point (pointOutId) or a recipient address (addressString) is required",
  );
}

/**
 * Body shared by offers/create and the doomed request/create stub.
 * Units: dims cm, place weight_gross grams, billing_details kopecks (Math.round).
 * Phone passed as-is — caller must already supply 79xxxxxxxxx; no reformatting here.
 * Destination comes from choice — does not re-read input.pointOutId.
 */
function buildPlatformOrderBody(
  input: CarrierCreateOrderInput,
  creds: YandexCredentials,
  choice: YandexDestinationChoice,
): Record<string, unknown> {
  const placeBarcode = `${input.clientNumber}-1`;
  const totalWeightG = input.items.reduce(
    (sum, item) => sum + item.weightG * item.quantity,
    0,
  );
  const boxDx = Math.max(...input.items.map((item) => item.lengthCm ?? 1));
  const boxDy = Math.max(...input.items.map((item) => item.widthCm ?? 1));
  const boxDz = Math.max(...input.items.map((item) => item.heightCm ?? 1));

  const { firstName, lastName } = splitRecipientName(input.recipient.contactName);

  const destination =
    choice.kind === "pickup_point"
      ? {
          type: "platform_station",
          platform_station: { platform_id: choice.pointOutId },
        }
      : {
          type: "custom_location",
          custom_location: {
            details: {
              // Known open issue: Yandex FAQ expects comma-separated parts without postal
              // code or apartment number — we pass recipient input as-is without stripping.
              full_address: `${input.recipient.city}, ${choice.addressString}`,
            },
          },
        };
  const lastMilePolicy =
    choice.kind === "pickup_point" ? "self_pickup" : "time_interval";

  return {
    info: { operator_request_id: input.clientNumber },
    source: { platform_station: { platform_id: creds.platformStationId } },
    destination,
    billing_info: { payment_method: "already_paid" },
    recipient_info: {
      first_name: firstName,
      last_name: lastName,
      // Assume already 79xxxxxxxxx — do not reformat in this slice.
      phone: input.recipient.phone,
    },
    last_mile_policy: lastMilePolicy,
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
}

function intervalBound(value: string | number | undefined): string {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

function mapYandexOffer(raw: YandexOffer): CarrierOffer | null {
  const offerId = raw.offer_id?.trim() ?? "";
  if (!offerId) {
    return null;
  }
  const details = raw.offer_details ?? {};
  const delivery = details.delivery_interval ?? {};
  const pickup = details.pickup_interval ?? {};
  const pricingTotal = details.pricing_total;
  if (!pricingTotal) {
    throw new Error("Yandex Delivery offer missing offer_details.pricing_total");
  }

  return {
    offerId,
    expiresAt: raw.expires_at ?? "",
    deliveryIntervalFrom: intervalBound(delivery.min),
    deliveryIntervalTo: intervalBound(delivery.max),
    pickupIntervalFrom: intervalBound(pickup.min),
    pickupIntervalTo: intervalBound(pickup.max),
    priceRub: parseRublePrice(pricingTotal),
    rawOffer: raw,
  };
}

/**
 * POST /offers/create — first half of the real two-phase order flow.
 * no_delivery_options is a returned result (a real answer: destination has no
 * Yandex service), not a throw — same shape as listPickupPoints' city_not_resolved.
 * Other error statuses throw with the raw body text. A malformed 200 body
 * (offers missing or not an array) throws; a legitimate offers: [] is
 * { ok: true, offers: [] }.
 */
export async function getOffers(
  input: CarrierCreateOrderInput,
  credentials: CarrierCredentials,
): Promise<CarrierOffersResult> {
  const choice = assertCreateOrderPreconditions(input);
  const creds = assertYandexCredentials(credentials);
  const body = buildPlatformOrderBody(input, creds, choice);

  const response = await yandexPost(creds, "/api/b2b/platform/offers/create", body);
  const rawText = await response.text();
  let raw: unknown;
  try {
    raw = JSON.parse(rawText) as unknown;
  } catch {
    raw = rawText;
  }

  // Key on the provider CODE, not the HTTP status — that is the fact Yandex
  // is stating; the status is incidental.
  if (
    raw !== null &&
    typeof raw === "object" &&
    "code" in raw &&
    (raw as { code: unknown }).code === "no_delivery_options"
  ) {
    return { ok: false, reason: "no_delivery_options" };
  }

  if (response.status !== 200) {
    throw new Error(`Yandex Delivery get offers failed: HTTP ${response.status} ${rawText}`);
  }

  const offersRaw =
    raw !== null && typeof raw === "object" && "offers" in raw
      ? (raw as { offers: unknown }).offers
      : undefined;
  if (!Array.isArray(offersRaw)) {
    throw new Error(
      "Yandex Delivery get offers failed: malformed response (offers missing or not an array)",
    );
  }

  const offers = (offersRaw as YandexOffer[])
    .map(mapYandexOffer)
    .filter((offer): offer is CarrierOffer => offer !== null);
  return { ok: true, offers };
}

/**
 * POST /offers/confirm — second half of the real two-phase order flow.
 *
 * Success criterion: non-empty request_id. Missing request_id → throw
 * (do not return a partial result).
 *
 * Expired/invalid offer detection lives here: Yandex returns an error
 * status with {code,message} (e.g. offer_was_not_found). That is thrown as
 * YandexOfferExpiredError so the orchestrator can branch on instanceof.
 *
 * Safe to retry on network timeout: Yandex dedupes on offer_id —
 * re-confirming the same offer returns the same request_id
 * (verified by probe 2026-07-13).
 */
export async function confirmOffer(
  offerId: string,
  credentials: CarrierCredentials,
): Promise<CarrierConfirmResult> {
  const creds = assertYandexCredentials(credentials);

  const response = await yandexPost(creds, "/api/b2b/platform/offers/confirm", {
    offer_id: offerId,
  });
  const rawText = await response.text();
  let raw: unknown;
  try {
    raw = JSON.parse(rawText) as unknown;
  } catch {
    raw = rawText;
  }

  if (response.status !== 200) {
    // Classify expired/invalid offer HERE (adapter), not in apps/web.
    // Strictly on parsed JSON code — never substring-match the raw body.
    // A malformed body that merely CONTAINS "offer_was_not_found" must NOT be
    // treated as expired: misclassifying → rollback to DRAFT → a real order
    // could be duplicated. Unknown/ambiguous stays generic Error (→ PROBLEM).
    const providerCode =
      raw !== null &&
      typeof raw === "object" &&
      "code" in raw &&
      typeof (raw as { code: unknown }).code === "string"
        ? (raw as { code: string }).code
        : undefined;
    const isOfferExpired = providerCode === "offer_was_not_found";
    const detail = `Yandex Delivery confirm offer failed: HTTP ${response.status} ${rawText}`;
    if (isOfferExpired) {
      throw new YandexOfferExpiredError(detail);
    }
    throw new Error(detail);
  }

  const data = raw as YandexConfirmOfferResponse;
  const requestId =
    typeof data?.request_id === "string" ? data.request_id.trim() : "";
  if (!requestId) {
    throw new Error(
      `Yandex Delivery confirm offer failed: missing request_id HTTP ${response.status} ${rawText}`,
    );
  }

  return { requestId, rawResponse: raw };
}

type YandexHistoryEntry = {
  status?: unknown;
  description?: unknown;
  timestamp?: unknown;
  timestamp_utc?: unknown;
};

/**
 * Map one state_history entry. Missing status or timestamp_utc → null (skip),
 * same as mapYandexOffer skipping an offer without offer_id.
 */
function mapYandexHistoryEntry(raw: YandexHistoryEntry): CarrierTrackingEvent | null {
  const statusCode =
    typeof raw.status === "string" ? raw.status.trim() : "";
  const eventAt =
    typeof raw.timestamp_utc === "string" ? raw.timestamp_utc.trim() : "";
  if (!statusCode || !eventAt) {
    return null;
  }
  const statusText =
    typeof raw.description === "string" ? raw.description : "";
  return {
    statusCode,
    statusText,
    eventAt,
    raw,
  };
}

/**
 * GET /request/history?request_id= — full status timeline for one order.
 *
 * state_history is empty until Yandex fills the first status asynchronously
 * (~10s after offers/confirm). An empty list is normal, not an error —
 * returns { ok: true, events: [] }.
 *
 * customer_order_not_found (keyed on CODE, not HTTP status) →
 * { ok: false, reason: "order_not_found" }. Other non-200 → throw.
 * state_history missing or not an array → throw malformed.
 * Does not map to ShipmentStatus — caller maps via mapYandexStatusToShipmentStatus.
 */
export async function getOrderHistory(
  providerOrderId: string,
  credentials: CarrierCredentials,
): Promise<CarrierOrderHistoryResult> {
  const creds = assertYandexCredentials(credentials);
  const path =
    `/api/b2b/platform/request/history?request_id=${encodeURIComponent(providerOrderId)}`;

  const response = await yandexGet(creds, path);
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
    (raw as { code: unknown }).code === "customer_order_not_found"
  ) {
    return { ok: false, reason: "order_not_found" };
  }

  if (response.status !== 200) {
    throw new Error(
      `Yandex Delivery get order history failed: HTTP ${response.status} ${rawText}`,
    );
  }

  const historyRaw =
    raw !== null && typeof raw === "object" && "state_history" in raw
      ? (raw as { state_history: unknown }).state_history
      : undefined;
  if (!Array.isArray(historyRaw)) {
    throw new Error(
      "Yandex Delivery get order history failed: malformed response (state_history missing or not an array)",
    );
  }

  const events = (historyRaw as YandexHistoryEntry[])
    .map(mapYandexHistoryEntry)
    .filter((event): event is CarrierTrackingEvent => event !== null);

  return { ok: true, events };
}

/**
 * POST /request/cancel {"request_id"} — ask Yandex to start cancelling an order.
 *
 * Cancellation does NOT cancel. It STARTS cancellation. After a successful 200,
 * state.status / providerStatus typically stays "CREATED" (verified live
 * 2026-07-16/17; research doc). Nothing in this API tells us whether the order
 * was actually cancelled or will still be delivered.
 *
 * `accepted: true` on HTTP 200 means ONLY that Yandex took the cancel request —
 * it is NOT cancelled. Do not read accepted as a terminal outcome.
 *
 * customer_order_not_found (keyed on CODE, not HTTP status) →
 * { ok: false, reason: "order_not_found" }. Other non-200 → throw.
 * 200 without a string `status` → throw malformed.
 */
export async function cancelOrder(
  providerOrderId: string,
  credentials: CarrierCredentials,
): Promise<CarrierCancelOrderResult> {
  const creds = assertYandexCredentials(credentials);

  const response = await yandexPost(creds, "/api/b2b/platform/request/cancel", {
    request_id: providerOrderId,
  });
  const rawText = await response.text();
  let raw: unknown;
  try {
    raw = JSON.parse(rawText) as unknown;
  } catch {
    raw = rawText;
  }

  // Key on the provider CODE, not the HTTP status — same as getOrderHistory /
  // getOffers no_delivery_options.
  if (
    raw !== null &&
    typeof raw === "object" &&
    "code" in raw &&
    (raw as { code: unknown }).code === "customer_order_not_found"
  ) {
    return { ok: false, reason: "order_not_found" };
  }

  if (response.status !== 200) {
    throw new Error(
      `Yandex Delivery cancel order failed: HTTP ${response.status} ${rawText}`,
    );
  }

  const providerStatus =
    raw !== null &&
    typeof raw === "object" &&
    "status" in raw &&
    typeof (raw as { status: unknown }).status === "string"
      ? (raw as { status: string }).status
      : undefined;
  if (providerStatus === undefined) {
    throw new Error(
      "Yandex Delivery cancel order failed: malformed response (status missing or not a string)",
    );
  }

  // accepted is true because HTTP 200 means Yandex accepted the cancel
  // *request* — not that the order is cancelled. The order may still be
  // delivered; nothing in this API will ever tell us which happened.
  const result: {
    accepted: true;
    providerStatus: string;
    reason?: string;
    description?: string;
  } = {
    accepted: true,
    providerStatus,
  };

  if (
    raw !== null &&
    typeof raw === "object" &&
    "reason" in raw &&
    typeof (raw as { reason: unknown }).reason === "string"
  ) {
    result.reason = (raw as { reason: string }).reason;
  }

  if (
    raw !== null &&
    typeof raw === "object" &&
    "description" in raw &&
    typeof (raw as { description: unknown }).description === "string" &&
    (raw as { description: string }).description.length > 0
  ) {
    result.description = (raw as { description: string }).description;
  }

  return { ok: true, result };
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
 * getOffers() + confirmOffer() implement both halves. Rewriting this
 * method onto offers/confirm is a later slice. The 11 createOrder tests
 * still assert the CURRENT (wrong) request/create shape.
 */
export async function createOrder(
  input: CarrierCreateOrderInput,
  credentials: CarrierCredentials,
): Promise<CarrierCreateOrderResult> {
  const choice = assertCreateOrderPreconditions(input);
  const creds = assertYandexCredentials(credentials);
  const body = buildPlatformOrderBody(input, creds, choice);

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
