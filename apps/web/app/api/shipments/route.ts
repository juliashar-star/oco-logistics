import { NextResponse } from "next/server";
import type { Prisma, ShipmentStatus } from "@prisma/client";
import { withAuth } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";
import { decryptShipmentRecipientPii } from "@/lib/recipient-pii";

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

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const shipmentSelect = {
  id: true,
  createdAt: true,
  status: true,
  trackNumber: true,
  labelUrl: true,
  recipientName: true,
  destCity: true,
  plannedCost: true,
  plannedDeliveryDays: true,
  isReturned: true,
  isCanceled: true,
  returnReason: true,
  isAnonymized: true,
  carrier: { select: { name: true } },
} satisfies Prisma.ShipmentSelect;

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

export const GET = withAuth(async (request, user) => {
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status")?.trim();
  const track = searchParams.get("track")?.trim();
  const limit = parseLimit(searchParams.get("limit"));

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
    const [shipments, total] = await Promise.all([
      prisma.shipment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        select: shipmentSelect,
      }),
      prisma.shipment.count({ where }),
    ]);

    return NextResponse.json({
      shipments: shipments.map(decryptShipmentRecipientPii),
      total,
    });
  } catch {
    console.error("list shipments failed");
    return NextResponse.json(
      { error: "Не удалось загрузить список отправлений. Попробуйте позже." },
      { status: 500 },
    );
  }
});
