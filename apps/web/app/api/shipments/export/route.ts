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
            providerKeyForName === ""
              ? ""
              : carrierCabinetName(providerKeyForName),
        };
      }),
    );

    void logAuditEvent({
      userId: user.userId,
      companyId: user.companyId,
      action: "shipment.export",
      entityType: "company",
      entityId: user.companyId,
    });

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${shipmentsExportFilename(exportedAt)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    console.error("export shipments failed");
    return NextResponse.json(
      { error: "Не удалось экспортировать отправления. Попробуйте позже." },
      { status: 500 },
    );
  }
}, { requireEmailVerified: true });
