import type { PrismaClient, ShipmentStatus } from "@prisma/client";

export type CaptureResult =
  | { captured: true }
  | { captured: false; reason: "not_found" }
  | { captured: false; reason: "not_draft"; status: ShipmentStatus };

/**
 * Atomically claim a DRAFT shipment for submit (DRAFT → SUBMITTING).
 *
 * Why updateMany-with-status-guard is the atomicity mechanism: a single
 * `UPDATE … WHERE id=? AND companyId=? AND status='DRAFT'` is atomic at the
 * row level in Postgres. Two concurrent callers cannot both match the same
 * DRAFT row — only one UPDATE gets count=1; the loser sees count=0 and
 * disambiguates via findUnique. No transaction wrapping a network call:
 * there is no network call here; the conditional UPDATE itself is the CAS.
 */
export async function captureForSubmit(
  prisma: PrismaClient,
  shipmentId: string,
  companyId: string,
): Promise<CaptureResult> {
  const res = await prisma.shipment.updateMany({
    where: { id: shipmentId, companyId, status: "DRAFT" },
    data: { status: "SUBMITTING", submittingAt: new Date() },
  });
  if (res.count === 1) return { captured: true };

  const row = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!row || row.companyId !== companyId) {
    return { captured: false, reason: "not_found" };
  }
  return { captured: false, reason: "not_draft", status: row.status };
}
