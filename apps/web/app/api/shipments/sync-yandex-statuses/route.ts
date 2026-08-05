import { NextResponse } from "next/server";
import { STATUS_SYNC_ADAPTERS } from "@oco/core/carrier-adapter/status-sync-adapters";
import { withAuth } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";
import { syncYandexShipmentStatuses } from "@/lib/shipments/sync-yandex-statuses";

// Separate from POST /api/shipments/sync-statuses (APIShip): appending a Yandex
// call there would let a Yandex fault 500 the whole request including APIShip
// work that already succeeded — a regression on the live path. They do NOT merge:
// per the 2026-07-23 decision APIShip is not a delivery channel, so the APIShip
// sync goes away with the legacy-route cleanup instead.
//
// CarrierAuthError is contained per provider inside syncYandexShipmentStatuses
// (authFailed / authFailedCarriers on the 200 result). Do not map it to a
// Yandex-specific 400 here — that aborted the whole button press for one
// carrier's bad token.

export const POST = withAuth(async (request, user) => {
  try {
    const result = await syncYandexShipmentStatuses(prisma, user.companyId, {
      adapters: STATUS_SYNC_ADAPTERS,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    // Never forward error.message — getOrderHistory interpolates the provider
    // raw body into its throw.
    console.error("[shipments/sync-yandex-statuses] sync failed", error);
    return NextResponse.json(
      { error: "Не удалось обновить статусы. Попробуйте позже." },
      { status: 500 },
    );
  }
});
