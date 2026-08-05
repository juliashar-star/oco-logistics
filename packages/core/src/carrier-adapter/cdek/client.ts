import type {
  CarrierConfirmResult,
  CarrierCreateOrderInput,
  CarrierCredentials,
  CarrierListPointsInput,
  CarrierListPointsResult,
  CarrierOffer,
  CarrierOffersResult,
  CarrierOrderHistoryResult,
  CarrierOrderInfo,
  CarrierOrderInfoResult,
  CarrierOrderItem,
  CarrierPickupPoint,
  CarrierTrackingEvent,
} from "../types";
import { buildCdekLocation } from "./build-cdek-location";
import { buildCdekOrderBody } from "./build-order-body";
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
  hasCdekErrorCode,
  readCdekCreateState,
} from "./order-state";
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

/** Poll budget for CREATE settlement. Measured settlement is 3–7 s. */
const CDEK_CONFIRM_POLL_BUDGET_MS = 15_000;
const CDEK_CONFIRM_POLL_INTERVAL_MS = 1_000;
/** Hard cap on GET /v2/orders/{uuid} attempts — wall clock alone is not enough. */
const CDEK_CONFIRM_POLL_MAX_ATTEMPTS = 20;

export type CdekConfirmOfferOptions = {
  /** Injectable delay between polls — tests pass a no-op so they do not wait. */
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  pollBudgetMs?: number;
  /** Max GET polls after create; stops even if wall budget remains. */
  pollMaxAttempts?: number;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function throwInvalid(errorCodes: string[]): never {
  throw new Error(`CDEK_ORDER_INVALID: ${errorCodes.join(",")}`);
}

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
 * Confirm a chosen CDEK offer: lookup-by-im_number → create if absent → poll.
 *
 * Wired into ORDER_ADAPTERS as cdek:delivery.confirmOffer. Optional 4th arg
 * is for tests (no-op sleep / short poll budget); the adapter type only
 * exposes the first three — callers that need options import this export.
 */
export async function confirmOffer(
  offer: CarrierOffer,
  input: CarrierCreateOrderInput,
  credentials: CarrierCredentials,
  options?: CdekConfirmOfferOptions,
): Promise<CarrierConfirmResult> {
  // 1. Build FIRST, before any network call: validates items, offer id and
  // credentials so our own bugs never reach the carrier.
  const orderBody = buildCdekOrderBody(input, offer, credentials);
  const creds = assertCdekCredentials(credentials);
  const baseUrl = resolveBaseUrl("CDEK_BASE_URL");
  const sleep = options?.sleep ?? defaultSleep;
  const pollIntervalMs =
    options?.pollIntervalMs ?? CDEK_CONFIRM_POLL_INTERVAL_MS;
  const pollBudgetMs = options?.pollBudgetMs ?? CDEK_CONFIRM_POLL_BUDGET_MS;

  // 2. LOOKUP by our own number — adopt an existing order rather than POST
  // again (measured: duplicate POSTs under the same number create NEW uuids).
  const lookupPath = `/v2/orders?im_number=${encodeURIComponent(input.clientNumber)}`;
  const lookupRes = await cdekGet(baseUrl, creds, lookupPath);
  const lookupBody = await readResponseBody(lookupRes);

  if (lookupRes.ok) {
    const adopted = readCdekCreateState(lookupBody);
    if (
      (adopted.state === "created" || adopted.state === "pending") &&
      adopted.uuid
    ) {
      // ADOPT — do not POST.
      return {
        requestId: adopted.uuid,
        rawResponse: lookupBody,
        warnings: [],
      };
    }
    if (adopted.state === "invalid") {
      // Do NOT create a second order: the body comes from the same draft and
      // would be rejected the same way.
      throwInvalid(adopted.errorCodes);
    }
    // 200 but nothing to adopt (no uuid) — do not POST; that risks a duplicate
    // against an order we failed to read. Own code — not an HTTP failure.
    throw new Error("CDEK_ORDER_LOOKUP_UNREADABLE");
  }

  if (!hasCdekErrorCode(lookupBody, "v2_entity_not_found_im_number")) {
    // Status only — never the body (may echo submitted fields / PII).
    throw new Error(`CDEK order lookup failed: HTTP ${lookupRes.status}`);
  }
  // v2_entity_not_found_im_number (measured HTTP 400) → nothing exists yet.

  // 3. POST /v2/orders
  const createRes = await cdekPost(baseUrl, creds, "/v2/orders", orderBody);
  const createBody = await readResponseBody(createRes);
  if (!createRes.ok) {
    throw new Error(`CDEK order create failed: HTTP ${createRes.status}`);
  }
  const created = readCdekCreateState(createBody);
  if (!created.uuid) {
    // Distinctive: safe to retry because the next attempt's lookup adopts the
    // order if CDEK did create one despite omitting uuid in this reply.
    throw new Error("CDEK_ORDER_CREATE_NO_UUID");
  }

  // 4. POLL GET /v2/orders/{uuid} until not pending (measured settle 3–7 s).
  let lastBody: unknown = createBody;
  let lastState = created;
  const pollStartedAt = Date.now();
  const pollMaxAttempts =
    options?.pollMaxAttempts ?? CDEK_CONFIRM_POLL_MAX_ATTEMPTS;
  let pollsDone = 0;

  while (lastState.state === "pending") {
    if (
      pollsDone >= pollMaxAttempts ||
      Date.now() - pollStartedAt >= pollBudgetMs
    ) {
      // Still pending at the cap → RETURN SUCCESS with the uuid. Losing it
      // would abandon a live order; the status sync will learn the truth later.
      return {
        requestId: created.uuid,
        rawResponse: lastBody,
        warnings: [],
      };
    }
    await sleep(pollIntervalMs);
    pollsDone += 1;
    const pollRes = await cdekGet(
      baseUrl,
      creds,
      `/v2/orders/${encodeURIComponent(created.uuid)}`,
    );
    // Non-2xx (or an unreadable body) is NOT evidence the order failed — we
    // already hold the uuid. Throwing here would skip persisting
    // providerOrderId and orphan a live carrier order. Unrecoverable beats
    // recoverable: treat as still pending, keep polling to the cap, return uuid.
    if (!pollRes.ok) {
      continue;
    }
    let pollBody: unknown;
    try {
      pollBody = await readResponseBody(pollRes);
    } catch {
      continue;
    }
    lastBody = pollBody;
    lastState = readCdekCreateState(pollBody);
  }

  if (lastState.state === "created") {
    // 5. warnings: [] — neutral warning enum is Yandex-shaped; CDEK has none.
    // 6. requestId = uuid; rawResponse = last body read.
    return {
      requestId: created.uuid,
      rawResponse: lastBody,
      warnings: [],
    };
  }

  // "invalid" — codes only, never provider message text.
  throwInvalid(lastState.errorCodes);
}

/**
 * Shared GET /v2/orders/{uuid} for history and info. No cache — sync is manual;
 * a cache would add staleness for a saving nobody can feel.
 */
async function fetchCdekOrderByUuid(
  providerOrderId: string,
  credentials: CarrierCredentials,
  opLabel: string,
): Promise<{ ok: false; reason: "order_not_found" } | { ok: true; body: unknown }> {
  const creds = assertCdekCredentials(credentials);
  const baseUrl = resolveBaseUrl("CDEK_BASE_URL");
  const path = `/v2/orders/${encodeURIComponent(providerOrderId)}`;
  const response = await cdekGet(baseUrl, creds, path);
  const body = await readResponseBody(response);

  // Exact code — not a prefix: "v2_entity_not_found_im_number" starts with
  // "v2_entity_not_found"; conflating them would treat a missing im_number as
  // a missing uuid (or the reverse).
  if (hasCdekErrorCode(body, "v2_entity_not_found")) {
    return { ok: false, reason: "order_not_found" };
  }

  // Malformed uuid (measured: HTTP 400, v2_invalid_format) is our own bug —
  // not a missing order. Status only; never the body.
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`CDEK ${opLabel} failed: HTTP ${response.status}`);
  }

  return { ok: true, body };
}

/**
 * Map one entity.statuses entry. Missing code / date_time → null (skip),
 * same as mapYandexHistoryEntry. deleted === true → null (skip).
 *
 * WHY skip deleted: the CDEK spec says deleted can only be true on a FINAL
 * status, so a cancelled-out «Вручен» would otherwise mark the shipment
 * delivered forever.
 */
function mapCdekStatusEntry(raw: unknown): CarrierTrackingEvent | null {
  if (raw === null || typeof raw !== "object") {
    return null;
  }
  const entry = raw as Record<string, unknown>;
  if (entry.deleted === true) {
    return null;
  }

  const statusCode =
    typeof entry.code === "string" ? entry.code.trim() : "";
  const eventAt =
    typeof entry.date_time === "string" ? entry.date_time.trim() : "";
  if (!statusCode || !eventAt) {
    return null;
  }

  const statusText = typeof entry.name === "string" ? entry.name : "";
  return {
    statusCode,
    statusText,
    eventAt,
    // Status entry ONLY — never the parent entity (recipient PD lives there).
    raw: entry,
  };
}

/**
 * GET /v2/orders/{uuid} → status timeline.
 * Does not sort — the sync sorts ascending by eventAt itself.
 * Not registered in STATUS_SYNC_ADAPTERS yet (S4).
 */
export async function getOrderHistory(
  providerOrderId: string,
  credentials: CarrierCredentials,
): Promise<CarrierOrderHistoryResult> {
  const fetched = await fetchCdekOrderByUuid(
    providerOrderId,
    credentials,
    "get order history",
  );
  if (!fetched.ok) {
    return fetched;
  }

  const body = fetched.body;
  const entity =
    body !== null && typeof body === "object"
      ? (body as { entity?: unknown }).entity
      : undefined;
  const statuses =
    entity !== null && typeof entity === "object"
      ? (entity as { statuses?: unknown }).statuses
      : undefined;

  if (!Array.isArray(statuses)) {
    throw new Error(
      "CDEK get order history failed: malformed response (statuses missing or not an array)",
    );
  }

  const events = statuses
    .map(mapCdekStatusEntry)
    .filter((event): event is CarrierTrackingEvent => event !== null);

  return { ok: true, events };
}

/**
 * GET /v2/orders/{uuid} → tracking number only.
 * Not registered in STATUS_SYNC_ADAPTERS yet (S4).
 *
 * trackingUrl is NOT set: CDEK's order response has no tracking link, and the
 * CarrierOrderInfo contract forbids rebuilding one from an id.
 *
 * plannedDeliveryFrom/To are NOT set: entity.planned_delivery_date is a
 * CALENDAR DATE and appears only after warehouse acceptance; feeding a
 * date-only value into an ISO datetime field would invent a time of day and
 * would also fire spurious delivery-date-changed events.
 */
export async function getOrderInfo(
  providerOrderId: string,
  credentials: CarrierCredentials,
): Promise<CarrierOrderInfoResult> {
  const fetched = await fetchCdekOrderByUuid(
    providerOrderId,
    credentials,
    "get order info",
  );
  if (!fetched.ok) {
    return fetched;
  }

  const body = fetched.body;
  const entity =
    body !== null &&
    typeof body === "object" &&
    (body as { entity?: unknown }).entity !== null &&
    typeof (body as { entity?: unknown }).entity === "object"
      ? ((body as { entity: Record<string, unknown> }).entity)
      : null;

  const info: CarrierOrderInfo = {};
  const cdekNumber =
    entity !== null && typeof entity.cdek_number === "string"
      ? entity.cdek_number
      : "";
  if (cdekNumber.length > 0) {
    info.trackingNumber = cdekNumber;
  }

  return { ok: true, info };
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
