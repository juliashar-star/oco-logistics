import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { syncShipmentStatuses } from "@/lib/shipments/sync-statuses";

export const POST = withAuth(async (request, user) => {
  try {
    const result = await syncShipmentStatuses(user.companyId);
    return NextResponse.json({
      updated: result.updated,
      events: result.events,
    });
  } catch {
    console.error("sync shipment statuses failed");
    return NextResponse.json(
      { error: "Не удалось обновить статусы" },
      { status: 502 },
    );
  }
});
