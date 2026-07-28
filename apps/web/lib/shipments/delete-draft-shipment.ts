import type { PrismaClient } from "@prisma/client";

export type DeleteDraftShipmentResult =
  | { ok: true }
  | { ok: false; reason: "not_found" };

/**
 * Deletes a company's own DRAFT shipment with no provider order id.
 * Single guarded deleteMany — count 0 covers missing, foreign, and non-deletable.
 */
export async function deleteDraftShipment(
  prisma: PrismaClient,
  shipmentId: string,
  companyId: string,
): Promise<DeleteDraftShipmentResult> {
  const res = await prisma.shipment.deleteMany({
    where: {
      id: shipmentId,
      companyId,
      status: "DRAFT",
      providerOrderId: null,
    },
  });
  if (res.count === 0) {
    return { ok: false, reason: "not_found" };
  }
  return { ok: true };
}
