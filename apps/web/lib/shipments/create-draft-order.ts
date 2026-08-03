import type {
  PickupType,
  PrismaClient,
  ProductCategory,
  SelectionMode,
  Shipment,
} from "@prisma/client";
import { Prisma } from "@prisma/client";

import { encryptShipmentRecipientFields } from "../recipient-pii";

export type CreateDraftInput = {
  companyId: string;
  createdByUserId: string;
  idempotencyKey: string;
  category?: ProductCategory;
  weightG: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  declaredValueRub?: number;
  destCity: string;
  destAddress?: string;
  destApartment?: string;
  deliveryComment?: string;
  pvzCode?: string;
  pickupType: PickupType;
  handoverMode: "COURIER" | "DROP_OFF";
  recipientName: string;
  recipientPhone: string;
  selectionMode: SelectionMode;
  legalBasisConfirmed: boolean;
  needsThermalBag?: boolean;
};

export type CreateDraftResult =
  | { created: true; shipment: Shipment }
  | { created: false; shipment: Shipment }
  | { conflict: true; reason: "not_draft"; shipment: Shipment };

/**
 * Create a DRAFT Shipment for the offers-flow path (no APIShip, no TariffQuotes).
 *
 * idempotencyKey makes create idempotent for one form session: the same key
 * updates the existing DRAFT (parcel / recipient / destination + wipe of stale
 * quote fields) instead of inserting a duplicate. A key already used by a
 * non-DRAFT row (or DRAFT with submittingAt set) is refused — never rewritten.
 */
export async function createDraftOrder(
  prisma: PrismaClient,
  input: CreateDraftInput,
): Promise<CreateDraftResult> {
  if (!input.legalBasisConfirmed) {
    throw new Error(
      "Подтвердите правовое основание обработки персональных данных получателя",
    );
  }

  const encryptedRecipient = encryptShipmentRecipientFields({
    recipientName: input.recipientName,
    recipientPhone: input.recipientPhone,
    destAddress: input.destAddress,
    destApartment: input.destApartment,
    deliveryComment: input.deliveryComment,
  });

  const declaredValue =
    input.declaredValueRub != null
      ? Math.round(input.declaredValueRub * 100)
      : null;

  const draftFields = {
    category: input.category ?? "OTHER",
    weightG: input.weightG,
    lengthCm: input.lengthCm,
    widthCm: input.widthCm,
    heightCm: input.heightCm,
    declaredValue,
    destCity: input.destCity.trim(),
    destAddress: encryptedRecipient.destAddress,
    destApartment: encryptedRecipient.destApartment,
    deliveryComment: encryptedRecipient.deliveryComment,
    pvzCode: input.pvzCode?.trim() || null,
    pickupType: input.pickupType,
    handoverMode: input.handoverMode ?? "DROP_OFF",
    needsThermalBag: input.needsThermalBag === true,
    recipientName: encryptedRecipient.recipientName,
    recipientPhone: encryptedRecipient.recipientPhone,
    selectionMode: input.selectionMode,
    legalBasisConfirmed: true,
    quotedOffers: Prisma.DbNull,
    selectedOfferId: null,
    selectedOfferExpiresAt: null,
  };

  try {
    const shipment = await prisma.shipment.create({
      data: {
        companyId: input.companyId,
        createdByUserId: input.createdByUserId,
        idempotencyKey: input.idempotencyKey,
        ...draftFields,
        status: "DRAFT",
      },
    });
    return { created: true, shipment };
  } catch (error) {
    if (
      !(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
    ) {
      throw error;
    }

    const existing = await prisma.shipment.findUnique({
      where: {
        companyId_idempotencyKey: {
          companyId: input.companyId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (!existing) {
      throw error;
    }

    // Atomic guard: never rewrite a row the carrier may already hold.
    const updated = await prisma.shipment.updateMany({
      where: {
        id: existing.id,
        companyId: input.companyId,
        status: "DRAFT",
        submittingAt: null,
      },
      data: draftFields,
    });

    if (updated.count === 0) {
      const current = await prisma.shipment.findUnique({
        where: { id: existing.id },
      });
      return {
        conflict: true,
        reason: "not_draft",
        shipment: current ?? existing,
      };
    }

    const shipment = await prisma.shipment.findUniqueOrThrow({
      where: { id: existing.id },
    });
    return { created: false, shipment };
  }
}
