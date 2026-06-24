import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db";

function kopecksToRubles(kopecks: number): number {
  return kopecks / 100;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  const now = new Date();
  const last30Days = new Date(now);
  last30Days.setDate(last30Days.getDate() - 30);
  const last7Days = new Date(now);
  last7Days.setDate(last7Days.getDate() - 7);

  const baseWhere = {
    companyId: user.companyId,
    status: { not: "DRAFT" as const },
  };

  try {
    const [
      totalShipments,
      shipmentsLast30Days,
      shipmentsLast7Days,
      totalSpendAgg,
      spendLast30DaysAgg,
      carrierGroups,
    ] = await Promise.all([
      prisma.shipment.count({ where: baseWhere }),
      prisma.shipment.count({
        where: { ...baseWhere, createdAt: { gte: last30Days } },
      }),
      prisma.shipment.count({
        where: { ...baseWhere, createdAt: { gte: last7Days } },
      }),
      prisma.shipment.aggregate({
        where: baseWhere,
        _sum: { plannedCost: true },
      }),
      prisma.shipment.aggregate({
        where: { ...baseWhere, createdAt: { gte: last30Days } },
        _sum: { plannedCost: true },
      }),
      prisma.shipment.groupBy({
        by: ["carrierId"],
        where: { ...baseWhere, carrierId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { carrierId: "desc" } },
        take: 3,
      }),
    ]);

    const carrierIds = carrierGroups
      .map((group) => group.carrierId)
      .filter((id): id is string => id != null);

    const carriers =
      carrierIds.length > 0
        ? await prisma.carrier.findMany({
            where: { id: { in: carrierIds } },
            select: { id: true, name: true },
          })
        : [];

    const carrierNameById = new Map(carriers.map((carrier) => [carrier.id, carrier.name]));

    const topCarriers = carrierGroups.map((group) => ({
      name: carrierNameById.get(group.carrierId!) ?? "Неизвестный",
      count: group._count._all,
    }));

    return NextResponse.json({
      totalShipments,
      shipmentsLast30Days,
      shipmentsLast7Days,
      totalSpend: kopecksToRubles(totalSpendAgg._sum.plannedCost ?? 0),
      spendLast30Days: kopecksToRubles(spendLast30DaysAgg._sum.plannedCost ?? 0),
      topCarriers,
    });
  } catch {
    console.error("dashboard stats failed");
    return NextResponse.json(
      { error: "Не удалось загрузить статистику. Попробуйте позже." },
      { status: 500 },
    );
  }
}
