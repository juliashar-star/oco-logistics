import { NextResponse } from "next/server";
import { getPickupPointAdapter } from "@oco/core/carrier-adapter/pickup-point-adapters";
import { withAuth } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";
import { listConnectedCarriers } from "@/lib/shipments/list-connected-carriers";
import { listPickupPointsForCompany } from "@/lib/shipments/list-pickup-points";
import { toPickupPointsResponse } from "@/lib/shipments/pickup-point-dto";

export const GET = withAuth(async (request, user) => {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city")?.trim() ?? "";

  if (!city) {
    return NextResponse.json(
      { error: "Укажите город для поиска ПВЗ" },
      { status: 400 },
    );
  }

  try {
    const result = await listPickupPointsForCompany(
      { city },
      {
        listConnected: () => listConnectedCarriers(prisma, user.companyId),
        getAdapter: getPickupPointAdapter,
      },
    );
    return NextResponse.json(toPickupPointsResponse(city, result));
  } catch (error) {
    console.error("[pickup-points] list failed", error);
    return NextResponse.json(
      { error: "Не удалось загрузить список ПВЗ. Попробуйте позже." },
      { status: 500 },
    );
  }
});
