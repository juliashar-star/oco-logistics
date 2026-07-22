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
  recipientName: string;
  recipientPhone: string;
  selectionMode: SelectionMode;
  legalBasisConfirmed: boolean;
};

export type CreateDraftResult =
  | { created: true; shipment: Shipment }
  | { created: false; shipment: Shipment };

/**
 * Create a DRAFT Shipment for the offers-flow path (no APIShip, no TariffQuotes).
 *
 * idempotencyKey makes create idempotent — a retried/double-clicked submit with the
 * same key returns the SAME row instead of a duplicate. { created:false } means the
 * key was already used (the row may already be past DRAFT — caller must not assume
 * it's a fresh draft).
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

  try {
    const shipment = await prisma.shipment.create({
      data: {
        companyId: input.companyId,
        createdByUserId: input.createdByUserId,
        idempotencyKey: input.idempotencyKey,
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
        recipientName: encryptedRecipient.recipientName,
        recipientPhone: encryptedRecipient.recipientPhone,
        selectionMode: input.selectionMode,
        status: "DRAFT",
        legalBasisConfirmed: true,
      },
    });
    return { created: true, shipment };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
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
      return { created: false, shipment: existing };
    }
    throw error;
  }
}
