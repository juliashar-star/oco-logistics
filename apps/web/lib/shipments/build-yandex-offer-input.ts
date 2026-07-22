import type { CarrierCreateOrderInput } from "@oco/core/carrier-adapter/types";

import { resolveSenderLocation } from "../sender-address";
import { deriveOperatorRequestId } from "./operator-request-id";

export type BuildYandexOfferShipment = {
  companyId: string;
  idempotencyKey: string | null;
  declaredValue: number | null;
  weightG: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  pickupType: "PVZ" | "COURIER";
  pvzCode: string | null;
  destCity: string;
  /** Already decrypted — route decrypts before calling. */
  destAddress: string | null;
  destApartment?: string | null;
  deliveryComment?: string | null;
  recipientName: string;
  recipientPhone: string;
};

export type BuildYandexOfferCompany = {
  name: string;
  inn: string | null;
  contactEmail: string;
  senderCity: string | null;
  senderAddress: string | null;
  senderPhone: string | null;
};

export type BuildOfferInputResult =
  | { ok: true; input: CarrierCreateOrderInput }
  | {
      ok: false;
      reason:
        | "no_declared_value"
        | "no_sender"
        | "no_sender_phone"
        | "no_idempotency_key"
        | "no_destination";
    };

/**
 * Pure mapper: decrypted Shipment fields + Company → Yandex CarrierCreateOrderInput.
 * No prisma, no fetch, no Yandex client.
 */
export function buildYandexOfferInput(args: {
  shipment: BuildYandexOfferShipment;
  company: BuildYandexOfferCompany;
}): BuildOfferInputResult {
  const { shipment, company } = args;

  // 1. DECLARED VALUE IS REQUIRED. Объявленная ценность is the SELLER'S legal
  // declaration about the SELLER'S goods and decides what they recover if the
  // parcel is lost — it is not OCO's to invent. (@oco/apiship defaults to 100 ₽
  // today; that is a defect on that path, not a precedent to copy.)
  // 0 is exactly the "declare nothing" outcome this file exists to prevent —
  // assessed_unit_price 0 tells Yandex the parcel is worth nothing. Negatives
  // are storable because create-draft does Math.round(declaredValueRub * 100)
  // with no validation.
  if (shipment.declaredValue == null || shipment.declaredValue <= 0) {
    return { ok: false, reason: "no_declared_value" };
  }

  // 7. clientNumber IS the Yandex operator_request_id — needs idempotencyKey.
  if (shipment.idempotencyKey == null) {
    return { ok: false, reason: "no_idempotency_key" };
  }

  // 5. SENDER from Company (same source as create-shipment.ts).
  const senderLoc = resolveSenderLocation(company);
  if (!senderLoc) {
    return { ok: false, reason: "no_sender" };
  }

  // A fabricated sender number is OCO inventing the seller's data — the same
  // defect as defaulting the declared value, which this file already refuses.
  // It has operational teeth: Yandex SMSes the SENDER's number to confirm
  // handover, so a fake number means the seller cannot hand the parcel over.
  // (create-shipment.ts keeps its fallback for now — that is a defect on the
  // APIShip path, not a precedent.)
  const senderPhone = company.senderPhone?.trim() ?? "";
  if (!senderPhone) {
    return { ok: false, reason: "no_sender_phone" };
  }

  // 4. DESTINATION — fail here if the seller has not chosen a point / address,
  // so the adapter never answers with its address-shaped YANDEX_NO_DESTINATION.
  let pointOutId: string | undefined;
  let addressString: string | undefined;
  if (shipment.pickupType === "PVZ") {
    const pvzCode = shipment.pvzCode?.trim() ?? "";
    if (!pvzCode) {
      return { ok: false, reason: "no_destination" };
    }
    pointOutId = pvzCode;
  } else {
    const destAddress = shipment.destAddress?.trim() ?? "";
    if (!destAddress) {
      return { ok: false, reason: "no_destination" };
    }
    addressString = destAddress;
  }

  // 2. UNITS: Shipment.declaredValue is KOPECKS; CarrierOrderItem.unitPriceRub
  // and assessedCostRub are RUBLES (Yandex adapter multiplies by 100 again).
  const unitPriceRub = shipment.declaredValue / 100;

  // 3. ONE SYNTHETIC ITEM — OCO models one parcel, not product lines; the
  // seller's real items would come from the CRM ingest path (not yet). Mirrors
  // @oco/apiship buildCreateOrderPayload's { description: "Посылка", quantity: 1 }.
  const items: CarrierCreateOrderInput["items"] = [
    {
      name: "Посылка",
      quantity: 1,
      unitPriceRub,
      weightG: shipment.weightG,
      lengthCm: shipment.lengthCm,
      widthCm: shipment.widthCm,
      heightCm: shipment.heightCm,
    },
  ];

  const input: CarrierCreateOrderInput = {
    // 8. providerKey fixed for this Yandex builder.
    providerKey: "yataxi",
    clientNumber: deriveOperatorRequestId(
      shipment.companyId,
      shipment.idempotencyKey,
    ),
    assessedCostRub: unitPriceRub,
    ...(pointOutId !== undefined ? { pointOutId } : {}),
    sender: {
      countryCode: "RU",
      contactName: company.name,
      companyName: company.name,
      companyInn: company.inn ?? undefined,
      email: company.contactEmail,
      phone: senderPhone,
      city: senderLoc.city,
      addressString: senderLoc.addressString ?? senderLoc.city,
    },
    // 6. RECIPIENT from the decrypted row; addressString only on COURIER (rule 4).
    recipient: {
      countryCode: "RU",
      contactName: shipment.recipientName,
      phone: shipment.recipientPhone,
      city: shipment.destCity,
      ...(addressString !== undefined ? { addressString } : {}),
    },
    deliveryApartment: shipment.destApartment ?? null,
    deliveryComment: shipment.deliveryComment ?? null,
    items,
  };

  return { ok: true, input };
}
