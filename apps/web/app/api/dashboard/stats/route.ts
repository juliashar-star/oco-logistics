import { NextResponse } from "next/server";
import { carrierCabinetName } from "@oco/core/carrier-adapter/carrier-cabinet-names";
import { tallyShipmentsByCarrier } from "@/lib/shipments/tally-shipments-by-carrier";
import { withAuth } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";
import { SHIPMENT_STATUSES_NOT_REAL } from "@/lib/load-seller-readiness";
import { describeSellerReadiness } from "@/lib/seller-readiness";

function kopecksToRubles(kopecks: number): number {
  return kopecks / 100;
}

export const GET = withAuth(async (_request, user) => {
  const now = new Date();
  const last30Days = new Date(now);
  last30Days.setDate(last30Days.getDate() - 30);
  const last7Days = new Date(now);
  last7Days.setDate(last7Days.getDate() - 7);

  // The one list, read straight from where it is declared. A local alias here
  // was a second NAME for it, and a second name is how a second list starts.
  const baseWhere = {
    companyId: user.companyId,
    status: { notIn: [...SHIPMENT_STATUSES_NOT_REAL] },
  };

  try {
    const [
      totalShipments,
      shipmentsLast30Days,
      shipmentsLast7Days,
      totalSpendAgg,
      spendLast30DaysAgg,
      carrierGroups,
      // The readiness inputs ride along in the SAME Promise.all — the dashboard
      // already waits for this batch, so the checklist costs no second request
      // and no extra latency.
      company,
      connectedCarrierCount,
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
      // BOTH carrier columns in ONE grouped query, reconciled below. Two
      // queries summed would double-count any row that ever carried both.
      prisma.shipment.groupBy({
        by: ["providerKey", "carrierId"],
        where: baseWhere,
        _count: { _all: true },
      }),
      prisma.company.findFirst({
        where: { id: user.companyId },
        select: { senderCity: true, senderPhone: true },
      }),
      prisma.carrierCredential.count({ where: { companyId: user.companyId } }),
    ]);

    const carrierIds = carrierGroups
      .map((group) => group.carrierId)
      .filter((id): id is string => id != null);

    const carriers =
      carrierIds.length > 0
        ? await prisma.carrier.findMany({
            where: { id: { in: carrierIds } },
            // apishipCode, NOT name: `name` is `providerKey.toUpperCase()` —
            // that is what put «CDEK», «DOSTAVISTA», «CSE» on this panel.
            select: { id: true, apishipCode: true },
          })
        : [];

    const providerKeyById = new Map(
      carriers.map((carrier) => [carrier.id, carrier.apishipCode]),
    );

    // Not capped: the panel sums up the seller's OWN shipments, so hiding some
    // of their own carriers behind a top-N would leave the column not adding up
    // to the total beside it. Bounded by how many carriers exist at all.
    const topCarriers = tallyShipmentsByCarrier(
      carrierGroups.map((group) => ({
        providerKey: group.providerKey,
        carrierId: group.carrierId,
        count: group._count._all,
      })),
      providerKeyById,
    ).map((entry) => ({
      // Resolved here, on the server; the browser receives only the string.
      name: carrierCabinetName(entry.providerKey),
      count: entry.count,
    }));

    // `totalShipments` IS the completed count — baseWhere already excludes
    // DRAFT and SUBMITTING — so the readiness object reuses it rather than
    // asking the database the same question twice.
    const readiness = describeSellerReadiness({
      emailVerified: user.emailVerified,
      senderCity: company?.senderCity ?? null,
      senderPhone: company?.senderPhone ?? null,
      connectedCarrierCount,
      completedShipmentCount: totalShipments,
    });

    return NextResponse.json({
      totalShipments,
      shipmentsLast30Days,
      shipmentsLast7Days,
      totalSpend: kopecksToRubles(totalSpendAgg._sum.plannedCost ?? 0),
      spendLast30Days: kopecksToRubles(spendLast30DaysAgg._sum.plannedCost ?? 0),
      topCarriers,
      readiness,
    });
  } catch {
    console.error("dashboard stats failed");
    return NextResponse.json(
      { error: "Не удалось загрузить статистику. Попробуйте позже." },
      { status: 500 },
    );
  }
});
