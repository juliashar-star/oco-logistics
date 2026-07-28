import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { logAuditEvent } from "@/lib/audit/log";
import { prisma } from "@/lib/db";
import { deleteDraftShipment } from "@/lib/shipments/delete-draft-shipment";

/**
 * Deletes the seller's own DRAFT shipment.
 *
 * Deliberate difference from anonymize: do NOT findUnique-then-403.
 * A single guarded deleteMany (companyId + status DRAFT + providerOrderId null)
 * returns the same 404 for «not yours», «not there» and «not deletable», so the
 * response cannot reveal that a shipment id exists in another company.
 * status DRAFT is the real rule; providerOrderId null is belt-and-braces.
 */
export const DELETE = withAuth<{ id: string }>(async (_request, user, { params }) => {
  const { id } = await params;
  const shipmentId = id.trim();
  if (!shipmentId) {
    return NextResponse.json({ error: "Отправление не найдено" }, { status: 404 });
  }

  const result = await deleteDraftShipment(prisma, shipmentId, user.companyId);
  if (!result.ok) {
    return NextResponse.json({ error: "Отправление не найдено" }, { status: 404 });
  }

  void logAuditEvent({
    userId: user.userId,
    companyId: user.companyId,
    action: "shipment.delete",
    entityType: "shipment",
    entityId: shipmentId,
  });

  return NextResponse.json({ ok: true });
});
