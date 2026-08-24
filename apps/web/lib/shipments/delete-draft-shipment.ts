import type { Prisma, PrismaClient } from "@prisma/client";

export type DeleteDraftShipmentResult =
  | { ok: true }
  | { ok: false; reason: "not_found" };

/**
 * The ONE rule for «this row may be deleted», shared by the single-shipment
 * delete and the bulk delete.
 *
 * status DRAFT is the real rule; providerOrderId null is belt-and-braces — a
 * draft that somehow reached a carrier must not vanish from under that order.
 * Written once on purpose: two copies of a destructive guard is exactly the
 * drift that ends with one of them forgetting a condition.
 */
function deletableDraftWhere(companyId: string): Prisma.ShipmentWhereInput {
  return {
    companyId,
    status: "DRAFT",
    providerOrderId: null,
  };
}

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
      ...deletableDraftWhere(companyId),
    },
  });
  if (res.count === 0) {
    return { ok: false, reason: "not_found" };
  }
  return { ok: true };
}

/**
 * Deletes whichever of the selected ids are this company's deletable drafts,
 * and reports HOW MANY went.
 *
 * PARTIAL BY DESIGN, unlike the handover act. The act refuses the whole
 * selection when one row is unfit, because the seller signs a document that
 * must match what they picked. Deleting has no such artefact: a selection that
 * mixes drafts with real orders is the normal way a seller tidies up, and
 * refusing all of it would force them to hand-deselect rows the guard is
 * already able to skip.
 *
 * THE GUARD MAKES THAT SAFE. One deleteMany carrying deletableDraftWhere cannot
 * touch a non-draft, a row with a carrier order, or another company's row —
 * whatever ids arrive, the where clause decides, and the count is simply how
 * many matched. There is no separate «check then delete» window for a status to
 * change inside.
 *
 * Returns a count and nothing else: see the delete route for why no per-id
 * reasons come back.
 */
export async function deleteSelectedDraftShipments(
  prisma: PrismaClient,
  shipmentIds: readonly string[],
  companyId: string,
): Promise<{ deleted: number }> {
  if (shipmentIds.length === 0) {
    return { deleted: 0 };
  }
  const res = await prisma.shipment.deleteMany({
    where: {
      id: { in: [...shipmentIds] },
      ...deletableDraftWhere(companyId),
    },
  });
  return { deleted: res.count };
}
