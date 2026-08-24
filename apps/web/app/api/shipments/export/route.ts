import { NextResponse } from "next/server";
import type { Prisma, ShipmentStatus } from "@prisma/client";
import { carrierCabinetName } from "@oco/core/carrier-adapter/carrier-cabinet-names";
import { withAuth } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit/log";
import { decryptShipmentRecipientPii } from "@/lib/recipient-pii";
import {
  buildShipmentsCsv,
  shipmentsExportFilename,
} from "@/lib/shipments/export-csv";
import {
  BULK_SELECTION_LIMIT,
  normalizeShipmentIds,
  parseShipmentIds,
} from "@/lib/shipments/shipment-ids-request";

const SHIPMENT_STATUSES = new Set<ShipmentStatus>([
  "DRAFT",
  "CREATED",
  "IN_TRANSIT",
  "AT_PVZ",
  "DELIVERED",
  "RETURNED",
  "CANCELED",
  "PROBLEM",
]);

const EXPORT_LIMIT = 10000;

const exportSelect = {
  createdAt: true,
  trackNumber: true,
  status: true,
  recipientName: true,
  recipientPhone: true,
  destCity: true,
  destAddress: true,
  pvzCode: true,
  pickupType: true,
  weightG: true,
  lengthCm: true,
  widthCm: true,
  heightCm: true,
  declaredValue: true,
  plannedCost: true,
  plannedDeliveryDays: true,
  plannedDeliveryDate: true,
  actualCost: true,
  deliveredAt: true,
  returnReason: true,
  isAnonymized: true,
  providerKey: true,
  orderAdapterKey: true,
  selectedOfferServiceName: true,
  // apishipCode, not name — see the list route: `name` is the key uppercased.
  carrier: { select: { apishipCode: true } },
} satisfies Prisma.ShipmentSelect;

/**
 * The ONE assembly both entries use: same select, same decryption, same carrier
 * name resolution, same CSV builder. Only the WHERE differs — filters for GET,
 * a list of ids for POST — so a column added here shows up in both files rather
 * than in whichever entry someone remembered.
 */
async function buildCsvResponse(where: Prisma.ShipmentWhereInput) {
  const shipments = await prisma.shipment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: EXPORT_LIMIT,
    select: exportSelect,
  });

  const exportedAt = new Date();
  // The name is resolved here, on the server, exactly as the list route does.
  const body = buildShipmentsCsv(
    shipments.map((row) => {
      const decrypted = decryptShipmentRecipientPii(row);
      const providerKeyForName =
        decrypted.providerKey ?? decrypted.carrier?.apishipCode ?? "";
      return {
        ...decrypted,
        carrierName:
          providerKeyForName === "" ? "" : carrierCabinetName(providerKeyForName),
      };
    }),
  );

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${shipmentsExportFilename(exportedAt)}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const GET = withAuth(async (request, user) => {
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status")?.trim();
  const track = searchParams.get("track")?.trim();

  if (statusParam && !SHIPMENT_STATUSES.has(statusParam as ShipmentStatus)) {
    return NextResponse.json({ error: "Некорректный статус отправления" }, { status: 400 });
  }

  const where: Prisma.ShipmentWhereInput = {
    companyId: user.companyId,
  };

  if (statusParam) {
    where.status = statusParam as ShipmentStatus;
  }

  if (track) {
    where.trackNumber = { contains: track, mode: "insensitive" };
  }

  try {
    const response = await buildCsvResponse(where);

    void logAuditEvent({
      userId: user.userId,
      companyId: user.companyId,
      action: "shipment.export",
      entityType: "company",
      entityId: user.companyId,
    });

    return response;
  } catch {
    console.error("export shipments failed");
    return NextResponse.json(
      { error: "Не удалось экспортировать отправления. Попробуйте позже." },
      { status: 500 },
    );
  }
}, { requireEmailVerified: true });

/**
 * Export of an explicit SELECTION, same body shape as every other bulk action.
 *
 * A second entry rather than an ids parameter on GET: a selection of up to a
 * hundred ids does not belong in a URL, and the two really are different
 * questions — «everything matching what I am looking at» versus «these rows».
 * Unlike the bulk delete this refuses nothing by status: exporting is reading,
 * and a seller may legitimately want a draft and a delivered parcel in one file.
 * Ids that are not this company's simply do not match the WHERE, so a foreign id
 * yields no row and no signal that it exists.
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
    const response = await buildCsvResponse({
      companyId: user.companyId,
      id: { in: shipmentIds },
    });

    void logAuditEvent({
      userId: user.userId,
      companyId: user.companyId,
      action: "shipment.export",
      entityType: "company",
      entityId: user.companyId,
    });

    return response;
  } catch {
    console.error("export selected shipments failed");
    return NextResponse.json(
      { error: "Не удалось экспортировать отправления. Попробуйте позже." },
      { status: 500 },
    );
  }
}, { requireEmailVerified: true });
