import { NextResponse } from "next/server";
import type { Prisma, ShipmentStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db";
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
  carrier: { select: { name: true } },
} satisfies Prisma.ShipmentSelect;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

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
    const body = buildShipmentsCsv(shipments);

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
}
