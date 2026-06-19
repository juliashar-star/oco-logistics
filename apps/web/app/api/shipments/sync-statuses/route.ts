import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { syncShipmentStatuses } from "@/lib/shipments/sync-statuses";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  try {
    const result = await syncShipmentStatuses(user.companyId);
    return NextResponse.json({
      updated: result.updated,
      events: result.events,
    });
  } catch (error) {
    console.error("sync shipment statuses failed", {
      companyId: user.companyId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Не удалось обновить статусы" },
      { status: 502 },
    );
  }
}
