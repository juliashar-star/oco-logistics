import { createHash } from "node:crypto";

import { CarrierQuoteChangedError } from "@oco/core/carrier-adapter/errors";
import type {
  CarrierCancelOrderResult,
  CarrierConfirmResult,
  CarrierConfirmWarning,
  CarrierCreateOrderInput,
  CarrierCredentials,
  CarrierOffer,
  CarrierOffersResult,
  CarrierOrderHistoryResult,
  CarrierOrderInfoResult,
  CarrierOrderItem,
} from "@oco/core/carrier-adapter/types";
import {
  OCO_CANCEL_REQUESTED,
  OCO_CANCEL_REQUESTED_TEXT_RU,
} from "../cancel-event-codes";
import { parcelFitsServiceLimits } from "../parcel-fits-service-limits";
import {
  EXPRESS_TAXI_CLASS_LIMITS,
  expressTaxiClassParcelLimits,
  type ExpressTaxiClass,
  type ExpressTaxiClassLimits,
} from "./express-taxi-class-limits";
import { mapCancelState } from "./map-cancel-state";
import { claimStatusTextRu } from "./map-claim-status";
import {
  mergeClaimWarnings,
  parseClaimWarnings,
} from "./parse-claim-warnings";
import {
  assertYandexCredentials,
  resolveBaseUrl,
  yandexPost,
} from "./transport";

export type { ExpressTaxiClass, ExpressTaxiClassLimits };
export {
  EXPRESS_TAXI_CLASS_LIMITS,
  expressTaxiClassCapacity,
} from "./express-taxi-class-limits";

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

/**
 * Whether this parcel fits a class's documented limits (see EXPRESS_TAXI_CLASS_LIMITS).
 *
 * Yandex does NOT enforce these at quote time — measured, a 15 kg parcel got
 * courier offers — so this filter is ours and deliberate.
 *
 * THE COMPARISON ITSELF IS NO LONGER HERE. It lives in
 * `parcelFitsServiceLimits`, the neutral rule the fan-out applies to every
 * service, and nothing in it was ever Express-specific. This function keeps
 * two things that ARE Express-specific and must not move:
 *   - the metres→centimetres conversion, done once by the class-limits module;
 *   - `convertNeutralItemToExpressMeasures`, which THROWS on a missing
 *     dimension. The neutral rule deliberately tolerates one; this adapter does
 *     not, and that difference is behaviour, not taste — so the validation runs
 *     here, before delegating, and an item without sides still throws exactly
 *     as it did before.
 * Kept as a second line of defence behind the fan-out filter: an adapter that
 * refuses a parcel it cannot carry should not depend on a caller remembering to
 * ask first.
 */
export function isExpressTaxiClassUsableForParcel(
  items: readonly CarrierOrderItem[],
  limits: ExpressTaxiClassLimits,
): boolean {
  if (items.length === 0) {
    return false;
  }
  for (const item of items) {
    convertNeutralItemToExpressMeasures(item);
  }
  return parcelFitsServiceLimits(items, expressTaxiClassParcelLimits(limits));
}

/**
 * Deterministic claims/create `request_id` from clientNumber + offerId.
 *
 * WHY derived (not a fresh uuid): Yandex returns the OLD claim for a reused
 * `request_id` regardless of body, so a per-shipment key would hand the seller
 * the wrong claim after a re-quote — while deterministic derivation also means
 * a retry after a crash returns the same claim instead of dispatching a second
 * courier. Same hashing approach as deriveOperatorRequestId (sha256 + colon
 * separator + hex slice); length stays within the documented 1–128 limit.
 */
export function deriveClaimsRequestId(
  clientNumber: string,
  offerId: string,
): string {
  const digest = createHash("sha256")
    .update(`${clientNumber}:${offerId}`)
    .digest("hex");
  return `oco-${digest.slice(0, 32)}`;
}

/** Money string for CargoItem.cost_value — pattern ^[0-9]+(\.[0-9]{1,2})?$ */
function formatExpressCostValue(unitPriceRub: number): string {
  if (!Number.isFinite(unitPriceRub) || unitPriceRub < 0) {
    throw new Error(
      `Yandex Express claims/create unusable unitPriceRub: ${String(unitPriceRub)}`,
    );
  }
  return unitPriceRub.toFixed(2);
}

/**
 * Pure claims/create body from a chosen offer + the same input getOffers saw.
 * Fields follow docs/research/yandex-express-api-2026-07-27.md §claims/create —
 * required CargoItem / route_points, plus size/weight and source email that the
 * schema leaves optional but the text requires in practice.
 */
export function buildClaimsCreateBody(
  offer: CarrierOffer,
  input: CarrierCreateOrderInput,
  taxiClass: ExpressTaxiClass,
): Record<string, unknown> {
  const senderEmail = input.sender.email?.trim();
  // Reject, do not omit or send undefined: docs text marks email required for
  // source points even though the OpenAPI schema does not. Silent omission would
  // only surface as a remote 400 after PII was already on the wire.
  if (!senderEmail) {
    throw new Error(
      "Yandex Express claims/create requires sender email on the source contact",
    );
  }

  const sourcePointId = 1;
  const destinationPointId = 2;

  const items = input.items.map((item: CarrierOrderItem) => {
    const measures = convertNeutralItemToExpressMeasures(item);
    return {
      title: item.name,
      cost_value: formatExpressCostValue(item.unitPriceRub),
      cost_currency: "RUB",
      quantity: item.quantity,
      size: {
        length: measures.length,
        width: measures.width,
        height: measures.height,
      },
      weight: measures.weight,
      pickup_point: sourcePointId,
      dropoff_point: destinationPointId,
    };
  });

  const body: Record<string, unknown> = {
    items,
    route_points: [
      {
        point_id: sourcePointId,
        visit_order: 1,
        type: "source",
        address: {
          fullname: composeExpressRouteFullname(
            input.sender.city,
            input.sender.addressString,
          ),
        },
        contact: {
          name: input.sender.contactName,
          phone: input.sender.phone,
          email: senderEmail,
        },
      },
      {
        point_id: destinationPointId,
        visit_order: 2,
        type: "destination",
        address: {
          fullname: composeExpressRouteFullname(
            input.recipient.city,
            input.recipient.addressString,
          ),
        },
        contact: {
          name: input.recipient.contactName,
          phone: input.recipient.phone,
        },
      },
    ],
    offer_payload: offer.offerId,
  };

  // When false/absent: send NO client_requirements at all — the create path
  // has never been exercised live, so keep it byte-identical to today.
  // When true: taxi_class is REQUIRED inside client_requirements once that
  // object is present (measured); cargo_options carries thermobag (Yandex
  // vocabulary — stays in this adapter only).
  if (input.needsThermalBag === true) {
    body.client_requirements = {
      taxi_class: taxiClass,
      cargo_options: ["thermobag"],
    };
  }

  return body;
}

type ExpressOfferPrice = {
  total_price?: string;
  total_price_with_vat?: string;
};

/**
 * Yandex quotes tariff prices NET of VAT (stated in the cabinet's Express tariff page),
 * so the net total_price is the figure this adapter reports. That page is the WHOLE basis
 * for the choice — nothing else here supports it.
 *
 * WHETHER THE OTHER FAMILY IS COMPARABLE IS NOT MEASURED. An earlier version of this
 * comment asserted that the request/* family's pricing_total is net too; nothing in the
 * repository ever supported that, and it is the justification a reader would lean on. The
 * truth is that pricing_total carries no VAT label, has no net/gross sibling to compare
 * against, and is documented nowhere. (`pricing` sits beside it and equals it exactly on
 * every offer stored in the LOCAL DEV database — sandbox-contour rows, read-only, not a
 * production measurement.)
 * If it turns out to be GROSS, the two families are not comparable and any cross-carrier
 * price comparison built on them is wrong by the VAT rate — see docs/OFFER_BADGES.md §3
 * and task 14 in docs/LIVE_ENVIRONMENT_TASKS.md. This provider has already been measured
 * to contradict its own VAT documentation once: the OpenAPI blurb calls pricing.offer.price
 * «без НДС», and on prod 27.07 it held the gross figure while net sat in price_raw.
 *
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

  // Deliberately drop raw.taxi_class: the neutral CarrierOffer must not
  // inherit carrier vocabulary — same rule that turned Yandex's `terminal`
  // into our `postamat`. The registry entry / adapterKey names the service.
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

/**
 * Build offers/calculate body. `taxiClass` comes from the caller (registry
 * entry); it is NOT copied onto the neutral CarrierOffer.
 */
export function buildCalculateBody(
  input: CarrierCreateOrderInput,
  taxiClass: ExpressTaxiClass,
): Record<string, unknown> {
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

  // When false/absent: requirements stays { taxi_classes } only — body
  // byte-identical to today. thermobag is Yandex vocabulary; only here.
  const requirements: Record<string, unknown> = {
    taxi_classes: [taxiClass],
  };
  if (input.needsThermalBag === true) {
    requirements.cargo_options = ["thermobag"];
  }

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
    requirements,
  };
}

/**
 * POST /b2b/cargo/integration/v2/offers/calculate — Express (claims/*) offers.
 * `taxiClass` is supplied by the registry entry that wraps this call.
 */
export async function getExpressOffers(
  input: CarrierCreateOrderInput,
  credentials: CarrierCredentials,
  taxiClass: ExpressTaxiClass,
): Promise<CarrierOffersResult> {
  // Schema fact from the OpenAPI RoutePointWithAddress / claims calculate contract:
  // a pickup-point destination cannot be expressed at all (no platform_station /
  // point-id field on the calculate route point). This is not a sandbox observation
  // — do not "fix" it by probing geography or inventing a station mapping here.
  if (input.pointOutId?.trim()) {
    return { ok: false, reason: "no_delivery_options" };
  }

  const classLimits = EXPRESS_TAXI_CLASS_LIMITS[taxiClass];
  // Ours and deliberate: Yandex does not enforce class limits at quote time
  // (measured: 15 kg parcel still got courier offers).
  if (!isExpressTaxiClassUsableForParcel(input.items, classLimits)) {
    return { ok: false, reason: "no_delivery_options" };
  }

  const creds = assertYandexCredentials(credentials);
  const baseUrl = resolveBaseUrl("YANDEX_EXPRESS_BASE_URL");
  const body = buildCalculateBody(input, taxiClass);

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

  // Class-limit gate already ran above; map only after that filter.
  const offers = (offersRaw as ExpressOffer[])
    .map(mapExpressOffer)
    .filter((offer): offer is CarrierOffer => offer !== null);

  return { ok: true, offers };
}

const ACCEPT_LANGUAGE_RU = { "Accept-Language": "ru" } as const;

const CLAIMS_PATH = "/b2b/cargo/integration/v2/claims";

/**
 * Grep anchor: the cancellation SUCCEEDED but we could not read the resulting
 * status. Distinct from any confirm-path marker — this one never means the
 * seller's cancel failed.
 */
const CANCEL_POST_INFO_LOG_MARKER = "[cancelExpressOrder] post-cancel info unreadable";

export type ConfirmExpressOfferOptions = {
  /** Delay between claims/info polls. Default ~1s (measured estimate ~1.2s). */
  pollIntervalMs?: number;
  /** Total wall-clock budget for polling. Default 15s. */
  pollBudgetMs?: number;
};

type ClaimsInfoSnapshot = {
  status: string;
  version: number;
  priceRaw: unknown;
  errorMessages: unknown;
  warnings: CarrierConfirmWarning[];
  raw: unknown;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readJsonBody(response: Response): Promise<unknown> {
  const rawText = await response.text();
  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return rawText;
  }
}

function readClaimVersion(raw: unknown, fallback: number): number {
  if (
    raw !== null &&
    typeof raw === "object" &&
    "version" in raw &&
    typeof (raw as { version: unknown }).version === "number" &&
    Number.isFinite((raw as { version: number }).version)
  ) {
    return (raw as { version: number }).version;
  }
  return fallback;
}

function parseAssessedPriceRaw(priceRaw: unknown): number | null {
  if (typeof priceRaw === "number" && Number.isFinite(priceRaw)) {
    return priceRaw;
  }
  if (typeof priceRaw === "string" && priceRaw.trim()) {
    const value = Number(priceRaw.trim());
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function assessedNotHigherThanQuote(
  assessedRub: number,
  quotedRub: number,
): boolean {
  return Math.round(assessedRub * 100) <= Math.round(quotedRub * 100);
}

/** Statuses where accept has not taken effect — free cancel is still safe. */
function isFreeCancelPreAcceptStatus(status: string): boolean {
  return (
    status === "new" ||
    status === "estimating" ||
    status === "estimating_failed" ||
    status === "ready_for_approval"
  );
}

async function cancelClaimFree(args: {
  baseUrl: string;
  creds: ReturnType<typeof assertYandexCredentials>;
  claimId: string;
  version: number;
}): Promise<void> {
  const { baseUrl, creds, claimId, version } = args;
  const response = await yandexPost(
    baseUrl,
    creds,
    `${CLAIMS_PATH}/cancel?claim_id=${encodeURIComponent(claimId)}`,
    { version, cancel_state: "free" },
    ACCEPT_LANGUAGE_RU,
  );
  if (response.status !== 200) {
    const rawText = await response.text();
    throw new Error(
      `Yandex Express claims/cancel failed: HTTP ${response.status} ${rawText}`,
    );
  }
}

/**
 * Cancel the claim (free at this pre-accept stage), log cancel failures, then
 * throw the original error — never swallow the first failure.
 */
async function cancelThenThrow(args: {
  baseUrl: string;
  creds: ReturnType<typeof assertYandexCredentials>;
  claimId: string;
  version: number;
  error: Error;
}): Promise<never> {
  const { baseUrl, creds, claimId, version, error } = args;
  try {
    await cancelClaimFree({ baseUrl, creds, claimId, version });
  } catch (cancelError) {
    console.error("[confirmExpressOffer] claims/cancel failed", cancelError);
  }
  throw error;
}

async function fetchClaimsInfo(args: {
  baseUrl: string;
  creds: ReturnType<typeof assertYandexCredentials>;
  claimId: string;
  versionFallback: number;
}): Promise<ClaimsInfoSnapshot> {
  const { baseUrl, creds, claimId, versionFallback } = args;
  const response = await yandexPost(
    baseUrl,
    creds,
    `${CLAIMS_PATH}/info?claim_id=${encodeURIComponent(claimId)}`,
    {},
    ACCEPT_LANGUAGE_RU,
  );
  const raw = await readJsonBody(response);
  if (response.status !== 200) {
    throw new Error(
      `Yandex Express claims/info failed: HTTP ${response.status} ${JSON.stringify(raw)}`,
    );
  }
  if (raw === null || typeof raw !== "object") {
    throw new Error("Yandex Express claims/info malformed: non-object body");
  }
  const status =
    "status" in raw && typeof (raw as { status: unknown }).status === "string"
      ? (raw as { status: string }).status
      : "";
  if (!status) {
    throw new Error("Yandex Express claims/info malformed: missing status");
  }
  const pricing =
    "pricing" in raw &&
    (raw as { pricing: unknown }).pricing !== null &&
    typeof (raw as { pricing: unknown }).pricing === "object"
      ? (raw as { pricing: Record<string, unknown> }).pricing
      : undefined;
  const offer =
    pricing &&
    "offer" in pricing &&
    pricing.offer !== null &&
    typeof pricing.offer === "object"
      ? (pricing.offer as Record<string, unknown>)
      : undefined;
  return {
    status,
    version: readClaimVersion(raw, versionFallback),
    priceRaw: offer?.price_raw,
    errorMessages:
      "error_messages" in raw
        ? (raw as { error_messages: unknown }).error_messages
        : undefined,
    // Never forward warning.message — codes only (see parseClaimWarnings).
    warnings: parseClaimWarnings(
      "warnings" in raw ? (raw as { warnings: unknown }).warnings : undefined,
    ),
    raw,
  };
}

/**
 * Express confirm: claims/create → bounded claims/info poll → claims/accept.
 * Accept is the only call that starts performer lookup — every failure path
 * cancels the claim first and never reaches accept.
 *
 * Optional 4th arg is for tests (short poll budget); production callers use
 * the CarrierAdapter 3-arg shape.
 */
export async function confirmExpressOffer(
  offer: CarrierOffer,
  input: CarrierCreateOrderInput,
  credentials: CarrierCredentials,
  taxiClass: ExpressTaxiClass,
  options?: ConfirmExpressOfferOptions,
): Promise<CarrierConfirmResult> {
  const pollIntervalMs = options?.pollIntervalMs ?? 1000;
  const pollBudgetMs = options?.pollBudgetMs ?? 15_000;

  const creds = assertYandexCredentials(credentials);
  const baseUrl = resolveBaseUrl("YANDEX_EXPRESS_BASE_URL");
  const requestId = deriveClaimsRequestId(input.clientNumber, offer.offerId);
  const createBody = buildClaimsCreateBody(offer, input, taxiClass);

  const createResponse = await yandexPost(
    baseUrl,
    creds,
    `${CLAIMS_PATH}/create?request_id=${encodeURIComponent(requestId)}`,
    createBody,
    ACCEPT_LANGUAGE_RU,
  );
  const createRaw = await readJsonBody(createResponse);
  if (createResponse.status !== 200) {
    throw new Error(
      `Yandex Express claims/create failed: HTTP ${createResponse.status} ${JSON.stringify(createRaw)}`,
    );
  }
  const claimId =
    createRaw !== null &&
    typeof createRaw === "object" &&
    "id" in createRaw &&
    typeof (createRaw as { id: unknown }).id === "string" &&
    (createRaw as { id: string }).id.trim()
      ? (createRaw as { id: string }).id.trim()
      : "";
  if (!claimId) {
    throw new Error("Yandex Express claims/create failed: missing claim id");
  }

  // Docs put `warnings` on both create and info and never say the sets match,
  // so reading only one risks losing a warning this slice exists to surface.
  const createWarnings = parseClaimWarnings(
    createRaw !== null &&
      typeof createRaw === "object" &&
      "warnings" in createRaw
      ? (createRaw as { warnings: unknown }).warnings
      : undefined,
  );

  let version = readClaimVersion(createRaw, 1);
  const pollStartedAt = Date.now();
  let info: ClaimsInfoSnapshot | undefined;

  for (;;) {
    const polled = await (async (): Promise<ClaimsInfoSnapshot> => {
      try {
        return await fetchClaimsInfo({
          baseUrl,
          creds,
          claimId,
          versionFallback: version,
        });
      } catch (error) {
        // Non-200 / malformed info must not leave the created claim dangling.
        return await cancelThenThrow({
          baseUrl,
          creds,
          claimId,
          version,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    })();
    info = polled;
    version = polled.version;

    if (polled.status === "new" || polled.status === "estimating") {
      if (Date.now() - pollStartedAt >= pollBudgetMs) {
        await cancelThenThrow({
          baseUrl,
          creds,
          claimId,
          version,
          error: new Error(
            "Yandex Express claims/info poll budget exhausted while still estimating",
          ),
        });
      }
      await sleep(pollIntervalMs);
      continue;
    }

    if (polled.status === "estimating_failed") {
      await cancelThenThrow({
        baseUrl,
        creds,
        claimId,
        version,
        error: new Error(
          `Yandex Express estimating_failed: ${JSON.stringify(polled.errorMessages)}`,
        ),
      });
    }

    if (polled.status === "ready_for_approval") {
      break;
    }

    await cancelThenThrow({
      baseUrl,
      creds,
      claimId,
      version,
      error: new Error(
        `Yandex Express unexpected claim status before accept: ${polled.status}`,
      ),
    });
  }

  // MEASURED: compare pricing.offer.price_raw (net), NOT price (gross on prod).
  const assessed = parseAssessedPriceRaw(info!.priceRaw);
  if (assessed === null || !assessedNotHigherThanQuote(assessed, offer.priceRub)) {
    await cancelThenThrow({
      baseUrl,
      creds,
      claimId,
      version,
      error: new CarrierQuoteChangedError(
        "Yandex Express assessed price_raw no longer matches the quoted price",
      ),
    });
  }

  const acceptResponse = await yandexPost(
    baseUrl,
    creds,
    `${CLAIMS_PATH}/accept?claim_id=${encodeURIComponent(claimId)}`,
    { version },
    ACCEPT_LANGUAGE_RU,
  );
  const acceptRaw = await readJsonBody(acceptResponse);
  if (acceptResponse.status !== 200) {
    // A non-200 accept may still have been processed; the bumped version would
    // make a cancel with the pre-accept version fail with a conflict. Re-fetch
    // status before deciding whether a free cancel is still safe.
    const acceptFailureMessage = `Yandex Express claims/accept failed: HTTP ${acceptResponse.status} ${JSON.stringify(acceptRaw)}; claim id ${claimId}`;
    let postAcceptInfo: ClaimsInfoSnapshot;
    try {
      postAcceptInfo = await fetchClaimsInfo({
        baseUrl,
        creds,
        claimId,
        versionFallback: version,
      });
    } catch {
      // Do not cancel blind — accept may have taken effect.
      throw new Error(
        `${acceptFailureMessage}; could not re-fetch status after accept (claim may have been accepted)`,
      );
    }

    if (isFreeCancelPreAcceptStatus(postAcceptInfo.status)) {
      await cancelThenThrow({
        baseUrl,
        creds,
        claimId,
        version: postAcceptInfo.version,
        error: new Error(acceptFailureMessage),
      });
    }

    // Accepted / performer lookup / anything past — do not force a paid cancel.
    throw new Error(
      `${acceptFailureMessage}; claim may have been accepted (status ${postAcceptInfo.status}); not auto-cancelling`,
    );
  }

  return {
    requestId: claimId,
    rawResponse: acceptRaw,
    warnings: mergeClaimWarnings(createWarnings, info!.warnings),
  };
}

/**
 * Express status snapshot → one CarrierTrackingEvent via claims/info.
 *
 * claims/journal is account-wide (cursor feed), not per-claim_id — so sync
 * polls claims/info for the current status + last_status_change_ts.
 * Do NOT attach the raw info body: it echoes recipient PII.
 *
 * Non-200 or missing status → { ok: false, reason: "order_not_found" }
 * (same shape as request/history when the provider does not know the id).
 * 401/403 still throw via yandexPost (CarrierAuthError).
 */
export async function getExpressOrderHistory(
  claimId: string,
  credentials: CarrierCredentials,
): Promise<CarrierOrderHistoryResult> {
  const creds = assertYandexCredentials(credentials);
  const baseUrl = resolveBaseUrl("YANDEX_EXPRESS_BASE_URL");
  const response = await yandexPost(
    baseUrl,
    creds,
    `${CLAIMS_PATH}/info?claim_id=${encodeURIComponent(claimId)}`,
    {},
    ACCEPT_LANGUAGE_RU,
  );
  const raw = await readJsonBody(response);

  if (response.status !== 200) {
    return { ok: false, reason: "order_not_found" };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "order_not_found" };
  }

  const body = raw as Record<string, unknown>;
  const status =
    typeof body.status === "string" ? body.status.trim() : "";
  if (!status) {
    return { ok: false, reason: "order_not_found" };
  }

  const lastStatusChangeTs =
    typeof body.last_status_change_ts === "string"
      ? body.last_status_change_ts.trim()
      : "";
  const updatedTs =
    typeof body.updated_ts === "string" ? body.updated_ts.trim() : "";
  const eventAt = lastStatusChangeTs || updatedTs;
  if (!eventAt) {
    return { ok: false, reason: "order_not_found" };
  }

  // TrackingEvent.statusText is non-nullable. Prefer our Russian label; when
  // the code is unknown to claimStatusTextRu, fall back to the status code
  // itself (honest, always available) — not "" and not Yandex product wording.
  const label = claimStatusTextRu(status);

  return {
    ok: true,
    events: [
      {
        statusCode: status,
        statusText: label ?? status,
        eventAt,
      },
    ],
  };
}

/**
 * No HTTP. claims/info is already consumed by getExpressOrderHistory; a claim
 * has no track number; a tracking link would come from claims/tracking-links
 * (later slice). Returning not-ok would increment infoFailed on every sync and
 * report a failure that did not happen.
 */
export async function getExpressOrderInfo(
  _claimId: string,
  _credentials: CarrierCredentials,
): Promise<CarrierOrderInfoResult> {
  return { ok: true, info: {} };
}

/**
 * Cancel an Express claim on the seller's behalf — FREE CANCELLATIONS ONLY.
 *
 * `providerOrderId` IS the claim id: confirmExpressOffer returns the claims id
 * as `requestId` and submit-order stores that in Shipment.providerOrderId.
 *
 * This is the conservative sibling of the stub it replaces. That stub existed
 * because cancelling an ACCEPTED claim can be PAID, and exposing that to a
 * seller without warning is a product decision rather than a mapping. Nothing
 * about that changed: the function asks cancel-info first and REFUSES anything
 * that is not free, so ОСО never spends the seller's money on their behalf.
 *
 * Sequence, and none of it may be reordered:
 *   1. claims/info      — the claim version, which cancel requires
 *   2. claims/cancel-info — is a free cancellation still on the table
 *   3. claims/cancel    — only when the answer was exactly "free"
 *   4. claims/info      — what actually happened (see the comment there)
 */
export async function cancelExpressOrder(
  providerOrderId: string,
  credentials: CarrierCredentials,
): Promise<CarrierCancelOrderResult> {
  const creds = assertYandexCredentials(credentials);
  const baseUrl = resolveBaseUrl("YANDEX_EXPRESS_BASE_URL");
  const claimId = providerOrderId;

  // NaN fallback on purpose: readClaimVersion returns the fallback when the
  // body carries no usable version, so a non-finite result here means we truly
  // could not read one. cancel REQUIRES version, and a guessed version would
  // either fail with old_version or, worse, cancel against a stale view of the
  // claim. Throw rather than invent.
  const before = await fetchClaimsInfo({
    baseUrl,
    creds,
    claimId,
    versionFallback: Number.NaN,
  });
  if (!Number.isFinite(before.version)) {
    throw new Error(
      `Yandex Express cancel: claim version unreadable; claim id ${claimId}`,
    );
  }

  const cancelInfoResponse = await yandexPost(
    baseUrl,
    creds,
    `${CLAIMS_PATH}/cancel-info?claim_id=${encodeURIComponent(claimId)}`,
    {},
    ACCEPT_LANGUAGE_RU,
  );
  const cancelInfoRaw = await readJsonBody(cancelInfoResponse);
  if (cancelInfoResponse.status !== 200) {
    throw new Error(
      `Yandex Express claims/cancel-info failed: HTTP ${cancelInfoResponse.status}`,
    );
  }

  // mapCancelState fails closed: anything we cannot read becomes "not_free",
  // never "free". An unreadable answer is not permission to spend money.
  const cancelState = mapCancelState(cancelInfoRaw);
  if (cancelState === "not_free") {
    return { ok: false, reason: "cancel_not_free" };
  }
  if (cancelState === "unavailable") {
    return { ok: false, reason: "cancel_unavailable" };
  }

  // WRITTEN INLINE, NOT VIA cancelClaimFree, deliberately. That helper throws on
  // any non-200 by design, because confirmExpressOffer uses it as recovery and a
  // silent failure there would strand a live claim — it must stay loud. Here the
  // opposite is true: a 409 is an ANSWER about what is possible, to be mapped
  // into a reason the seller can read. Reusing the helper would force us to
  // catch and re-parse an Error message, and changing it would make
  // confirmExpressOffer's recovery quiet. Two call sites, two contracts.
  //
  // cancel_state is the literal "free" and nothing else may ever be sent here:
  // "paid" is the enum member that spends the seller's money, and this function
  // has already refused every path that would need it.
  const cancelResponse = await yandexPost(
    baseUrl,
    creds,
    `${CLAIMS_PATH}/cancel?claim_id=${encodeURIComponent(claimId)}`,
    { version: before.version, cancel_state: "free" },
    ACCEPT_LANGUAGE_RU,
  );

  if (cancelResponse.status === 409) {
    const conflictRaw = await readJsonBody(cancelResponse);
    const code =
      conflictRaw !== null &&
      typeof conflictRaw === "object" &&
      "code" in conflictRaw &&
      typeof (conflictRaw as { code: unknown }).code === "string"
        ? (conflictRaw as { code: string }).code.trim()
        : "";

    // The doc's 409 list ends in «…» — it is EXPLICITLY incomplete, so only the
    // three named codes are mapped and anything else faults. Guessing at an
    // unknown conflict code would be inventing carrier behaviour.
    if (code === "free_cancel_is_unavailable" || code === "state_mismatch") {
      // The claim moved between cancel-info and cancel: free was true a moment
      // ago and is not any more.
      return { ok: false, reason: "cancel_not_free" };
    }
    if (code === "inappropriate_status") {
      return { ok: false, reason: "cancel_unavailable" };
    }
    throw new Error(
      `Yandex Express claims/cancel failed: HTTP 409 ${code || "code missing"}`,
    );
  }

  if (cancelResponse.status !== 200) {
    throw new Error(
      `Yandex Express claims/cancel failed: HTTP ${cancelResponse.status}`,
    );
  }

  // WHY A SECOND claims/info: the documentation has NO response block for
  // claims/cancel at all — path, query, header, request body and 409 codes, and
  // then it stops. So the cancel reply is not a source of a provider status, and
  // inventing one is not an option. The resulting claim status is the only
  // measured evidence of what happened (probe 27.07.2026: cancel → HTTP 200,
  // final info status `cancelled`).
  //
  // ITS FAILURE IS DELIBERATELY SILENT: by this point the cancellation HAS
  // succeeded, and turning a failed read into a thrown error would report a
  // failure that did not happen and invite the seller to press cancel again. We
  // do not retry, do not invent a status, and do not fall back to the PRE-cancel
  // status — that one is true about a moment that has passed.
  try {
    const after = await fetchClaimsInfo({
      baseUrl,
      creds,
      claimId,
      versionFallback: before.version,
    });
    const status = after.status.trim();
    if (status) {
      // NO `reason` ON THIS BRANCH, and the asymmetry with the fallback below is
      // deliberate. Here providerStatus carries the carrier's OWN resulting
      // status — `cancelled` or `cancelled_with_payment` — which is strictly
      // more informative than a code of ours, and it collides with nothing: the
      // claims vocabulary has no second meaning for those words the way CDEK's
      // ACCEPTED does. Setting a reason here would win the statusCode slot in
      // the route and hide the carrier's answer behind our own.
      const description = claimStatusTextRu(status);
      return {
        ok: true,
        result: {
          accepted: true,
          providerStatus: status,
          ...(description === null ? {} : { description }),
        },
      };
    }
    console.error(
      CANCEL_POST_INFO_LOG_MARKER,
      JSON.stringify({ claimId, reason: "status missing" }),
    );
  } catch {
    // Status only — never the body: claims/info echoes recipient PII.
    console.error(
      CANCEL_POST_INFO_LOG_MARKER,
      JSON.stringify({ claimId, reason: "info threw" }),
    );
  }

  // The type's own docblock sanctions "" for «the provider returned none», and
  // providerStatus stays "" because we genuinely have no carrier status here.
  //
  // BUT THE EVENT MUST STILL BE WRITEABLE. The route composes
  // `reason ?? providerStatus` into TrackingEvent.statusCode, and
  // resolveCancelTrackingEvent drops a row with no code at all — so without a
  // reason this branch would cancel the claim successfully and leave nothing in
  // the seller's timeline. The cancellation happened; the timeline must say so.
  // Same neutral code and wording CDEK uses: both mean «the request was sent,
  // confirmation follows», and neither claims the order is cancelled.
  return {
    ok: true,
    result: {
      accepted: true,
      providerStatus: "",
      reason: OCO_CANCEL_REQUESTED,
      description: OCO_CANCEL_REQUESTED_TEXT_RU,
    },
  };
}
