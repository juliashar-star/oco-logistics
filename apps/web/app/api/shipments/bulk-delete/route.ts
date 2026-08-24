import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { logAuditEvent } from "@/lib/audit/log";
import { prisma } from "@/lib/db";
import { deleteSelectedDraftShipments } from "@/lib/shipments/delete-draft-shipment";
import {
  BULK_SELECTION_LIMIT,
  normalizeShipmentIds,
  parseShipmentIds,
} from "@/lib/shipments/shipment-ids-request";

/**
 * Deletes the drafts among the selected shipments and answers with a COUNT.
 *
 * WHY A BARE COUNT AND NO PER-ID REASONS. The single-shipment delete answers the
 * same 404 for «not yours», «not there» and «not deletable», precisely so the
 * response cannot confirm that an id exists in another company. Returning
 * «these three were skipped because they are not drafts» here would hand back
 * exactly that: an oracle that separates a foreign id from a nonexistent one.
 * The seller already knows what they selected, and the confirmation told them
 * how many of it were drafts, so the count is the whole of what they need.
 *
 * PARTIAL, unlike the handover act, and safe because of the guard rather than
 * in spite of it: deleteSelectedDraftShipments runs ONE deleteMany carrying
 * status DRAFT + providerOrderId null + companyId, so no id in the request can
 * reach a non-draft, a row with a carrier order, or another company's row.
 *
 * The audit action is `shipment.delete`, the same one the single delete writes:
 * this is that operation over a list, not a new kind of deletion.
 */
export const POST = withAuth(async (request, user) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const parsed = parseShipmentIds(body);
  if (parsed == null) {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const shipmentIds = normalizeShipmentIds(parsed);
  if (shipmentIds.length === 0) {
    return NextResponse.json(
      { error: "Выберите хотя бы одно отправление" },
      { status: 400 },
    );
  }
  if (shipmentIds.length > BULK_SELECTION_LIMIT) {
    return NextResponse.json(
      {
        error: `Выбрано отправлений: ${shipmentIds.length}. Максимум за один раз: ${BULK_SELECTION_LIMIT}`,
      },
      { status: 400 },
    );
  }

  try {
    const { deleted } = await deleteSelectedDraftShipments(
      prisma,
      shipmentIds,
      user.companyId,
    );

    if (deleted > 0) {
      void logAuditEvent({
        userId: user.userId,
        companyId: user.companyId,
        action: "shipment.delete",
        entityType: "company",
        entityId: user.companyId,
      });
    }

    return NextResponse.json({ deleted });
  } catch {
    console.error("bulk delete shipments failed");
    return NextResponse.json(
      { error: "Не удалось удалить черновики. Попробуйте позже." },
      { status: 500 },
    );
  }
});
