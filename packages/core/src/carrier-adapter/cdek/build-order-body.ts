import type {
  CarrierCreateOrderInput,
  CarrierCredentials,
  CarrierOffer,
  CarrierOrderItem,
} from "../types";
import { buildCdekLocation } from "./build-cdek-location";
import { assertCdekCredentials } from "./transport";

/**
 * POST /v2/orders body shape measured on the CDEK sandbox (api.edu.cdek.ru).
 * Only fields that appeared on a SUCCESSFUL create are emitted.
 */
export type CdekOrderBody = {
  type: number;
  number: string;
  tariff_code: number;
  recipient: {
    name: string;
    phones: Array<{ number: string }>;
  };
  packages: Array<{
    number: string;
    weight: number;
    length?: number;
    width?: number;
    height?: number;
    items: Array<{
      name: string;
      ware_key: string;
      payment: { value: number };
      cost: number;
      weight: number;
      amount: number;
    }>;
  }>;
  from_location: { city: string; address: string };
  delivery_point?: string;
  to_location?: { city: string; address: string };
};

/**
 * Parse `cdek:<tariff_code>` synthesised by mapCdekTariffsToOffers.
 * An unparseable id is our own bug, not a carrier failure.
 */
function parseTariffCodeFromOfferId(offerId: string): number {
  const match = /^cdek:(\d+)$/.exec(offerId.trim());
  if (!match) {
    throw new Error(
      `CDEK_OFFER_ID_INVALID: expected cdek:<tariff_code>, got ${JSON.stringify(offerId)}`,
    );
  }
  return Number(match[1]);
}

function buildPackageItem(item: CarrierOrderItem, wareKey: string) {
  return {
    name: item.name,
    ware_key: wareKey,
    payment: { value: 0 },
    cost: item.unitPriceRub,
    weight: item.weightG,
    amount: item.quantity,
  };
}

/**
 * Pure builder for CDEK POST /v2/orders. No network.
 *
 * Measured rules (sandbox):
 * - packages[0].items is required (HTTP 400 v2_field_is_empty without it)
 * - sender end is always from_location; never shipment_point in this slice
 *   (handoverMode is already encoded in the chosen tariff_code / delivery_mode,
 *   so the body does not express it)
 * - recipient end is XOR: delivery_point OR to_location — never both
 *   (CDEK rejects both with v2_shipment_address_multivalued)
 */
export function buildCdekOrderBody(
  input: CarrierCreateOrderInput,
  offer: CarrierOffer,
  credentials: CarrierCredentials,
): CdekOrderBody {
  if (input.items.length === 0) {
    throw new Error("CDEK_INPUT_INVALID: at least one item is required");
  }

  const creds = assertCdekCredentials(credentials);
  const tariffCode = parseTariffCodeFromOfferId(offer.offerId);
  const item = input.items[0]!;

  // Synthetic single-parcel SKU — OCO has no real line articles yet.
  const wareKey = `${input.clientNumber}-1`;

  const pkg: CdekOrderBody["packages"][number] = {
    number: "1",
    weight: item.weightG,
    items: [buildPackageItem(item, wareKey)],
  };
  if (item.lengthCm !== undefined) pkg.length = item.lengthCm;
  if (item.widthCm !== undefined) pkg.width = item.widthCm;
  if (item.heightCm !== undefined) pkg.height = item.heightCm;

  const body: CdekOrderBody = {
    type: Number(creds.contractType),
    number: input.clientNumber,
    tariff_code: tariffCode,
    recipient: {
      name: input.recipient.contactName,
      phones: [{ number: input.recipient.phone }],
    },
    packages: [pkg],
    // Sender end does not branch: always address form via buildCdekLocation
    // (shared with getOffers — quote and order must describe the same place).
    // handoverMode is already encoded in the tariff_code; do not emit shipment_point.
    from_location: buildCdekLocation(
      input.sender.city,
      input.sender.addressString,
    ),
  };

  const pointOutId = input.pointOutId?.trim();
  if (pointOutId) {
    body.delivery_point = pointOutId;
  } else {
    body.to_location = buildCdekLocation(
      input.recipient.city,
      input.recipient.addressString,
    );
  }

  return body;
}
