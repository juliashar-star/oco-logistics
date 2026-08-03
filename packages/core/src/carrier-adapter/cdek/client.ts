import type {
  CarrierCreateOrderInput,
  CarrierCredentials,
  CarrierOffersResult,
  CarrierOrderItem,
} from "../types";
import { cdekDeliveryMode } from "./delivery-mode";
import { mapCdekTariffsToOffers } from "./map-cdek-tariffs";
import {
  assertCdekCredentials,
  cdekPost,
  resolveBaseUrl,
} from "./transport";

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
    from_location: {
      city: input.sender.city,
      address: input.sender.addressString ?? input.sender.city,
    },
    to_location: {
      city: input.recipient.city,
      address: input.recipient.addressString ?? input.recipient.city,
    },
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
