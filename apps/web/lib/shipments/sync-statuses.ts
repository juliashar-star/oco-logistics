import type { Prisma, ShipmentStatus } from "@prisma/client";
import {
  mapApishipStatusToShipmentStatus,
  type ApishipOrderStatusEntry,
  type ApishipStatusEvent,
} from "@oco/apiship";
import { prisma } from "@/lib/db";
import { getApishipClientForCompany } from "@/lib/apiship-client-for-company";

const TERMINAL_STATUSES: ShipmentStatus[] = ["DELIVERED", "RETURNED", "CANCELED"];
const APISHIP_BATCH_SIZE = 100;

export type SyncShipmentStatusesResult = {
  updated: number;
  events: number;
};

type ShipmentForSync = {
  id: string;
  apishipOrderId: string;
  status: ShipmentStatus;
  arrivedAtPvzAt: Date | null;
  deliveredAt: Date | null;
};

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function parseApishipOrderId(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseEventAt(created: string): Date | null {
  const trimmed = created.trim();
  if (!trimmed) {
    return null;
  }

  const eventAt = new Date(trimmed);
  return Number.isNaN(eventAt.getTime()) ? null : eventAt;
}

function buildStatusText(status: ApishipStatusEvent): string {
  return status.name.trim() || status.description.trim() || status.key;
}

function buildFactDateUpdates(
  mappedStatus: ShipmentStatus,
  eventAt: Date,
  shipment: Pick<ShipmentForSync, "arrivedAtPvzAt" | "deliveredAt">,
): Pick<Prisma.ShipmentUpdateInput, "arrivedAtPvzAt" | "deliveredAt"> {
  const updates: Pick<Prisma.ShipmentUpdateInput, "arrivedAtPvzAt" | "deliveredAt"> = {};

  if (mappedStatus === "AT_PVZ" && shipment.arrivedAtPvzAt == null) {
    updates.arrivedAtPvzAt = eventAt;
  }

  if (mappedStatus === "DELIVERED" && shipment.deliveredAt == null) {
    updates.deliveredAt = eventAt;
  }

  return updates;
}

async function processSucceedOrder(
  companyId: string,
  entry: ApishipOrderStatusEntry,
  counters: { updated: number; events: number },
): Promise<void> {
  const clientNumber = entry.orderInfo.clientNumber?.trim();
  if (!clientNumber) {
    console.error("[sync-statuses] missing clientNumber in APIShip response", {
      apishipOrderId: entry.orderInfo.orderId,
    });
    return;
  }

  const shipment = await prisma.shipment.findFirst({
    where: {
      id: clientNumber,
      companyId,
    },
    select: {
      id: true,
      status: true,
      arrivedAtPvzAt: true,
      deliveredAt: true,
      isReturned: true,
      isCanceled: true,
      returnReason: true,
    },
  });

  if (!shipment) {
    console.error("[sync-statuses] shipment not found for APIShip clientNumber", {
      apishipOrderId: entry.orderInfo.orderId,
    });
    return;
  }

  const eventAt = parseEventAt(entry.status.created);
  if (!eventAt) {
    console.error("[sync-statuses] invalid status.created in APIShip response", {
      apishipOrderId: entry.orderInfo.orderId,
      statusKey: entry.status.key,
    });
    return;
  }

  const statusCode = entry.status.key.trim() || "unknown";
  const compositeKey = {
    shipmentId_statusCode_eventAt: {
      shipmentId: shipment.id,
      statusCode,
      eventAt,
    },
  };

  const existingEvent = await prisma.trackingEvent.findUnique({
    where: compositeKey,
  });

  if (!existingEvent) {
    await prisma.trackingEvent.upsert({
      where: compositeKey,
      create: {
        shipmentId: shipment.id,
        statusCode,
        statusText: buildStatusText(entry.status),
        eventAt,
        rawResponse: entry.status as Prisma.InputJsonValue,
      },
      update: {},
    });
    counters.events += 1;
  }

  const mappedStatus = mapApishipStatusToShipmentStatus(statusCode);
  if (mappedStatus == null) {
    return;
  }

  const shipmentUpdates: Prisma.ShipmentUpdateInput = {
    ...buildFactDateUpdates(mappedStatus, eventAt, shipment),
  };

  if (mappedStatus !== shipment.status) {
    shipmentUpdates.status = mappedStatus;
  }

  if (mappedStatus === "RETURNED" && shipment.isReturned !== true) {
    shipmentUpdates.isReturned = true;
  }

  if (mappedStatus === "CANCELED" && shipment.isCanceled !== true) {
    shipmentUpdates.isCanceled = true;
  }

  if (
    (mappedStatus === "RETURNED" || mappedStatus === "CANCELED") &&
    (shipment.returnReason == null || shipment.returnReason.trim() === "")
  ) {
    shipmentUpdates.returnReason = statusCode;
  }

  if (Object.keys(shipmentUpdates).length === 0) {
    return;
  }

  await prisma.shipment.update({
    where: { id: shipment.id },
    data: shipmentUpdates,
  });

  if (mappedStatus !== shipment.status) {
    counters.updated += 1;
  }
}

/**
 * Синхронизация статусов отправлений компании с APIShip (ручной триггер, US-4.2).
 */
export async function syncShipmentStatuses(
  companyId: string,
): Promise<SyncShipmentStatusesResult> {
  const shipments = await prisma.shipment.findMany({
    where: {
      companyId,
      apishipOrderId: { not: null },
      status: { notIn: TERMINAL_STATUSES },
    },
    select: {
      id: true,
      apishipOrderId: true,
      status: true,
      arrivedAtPvzAt: true,
      deliveredAt: true,
    },
  });

  const shipmentsForSync = shipments.flatMap((shipment) => {
    if (!shipment.apishipOrderId) {
      return [];
    }

    return [
      {
        id: shipment.id,
        apishipOrderId: shipment.apishipOrderId,
        status: shipment.status,
        arrivedAtPvzAt: shipment.arrivedAtPvzAt,
        deliveredAt: shipment.deliveredAt,
      },
    ];
  });

  if (shipmentsForSync.length === 0) {
    return { updated: 0, events: 0 };
  }

  const orderIds = shipmentsForSync
    .map((shipment) => parseApishipOrderId(shipment.apishipOrderId))
    .filter((orderId): orderId is number => orderId != null);

  if (orderIds.length === 0) {
    return { updated: 0, events: 0 };
  }

  const client = await getApishipClientForCompany(companyId);
  const counters = { updated: 0, events: 0 };

  for (const batch of chunk(orderIds, APISHIP_BATCH_SIZE)) {
    const result = await client.getOrderStatuses(batch);

    for (const failure of result.failedOrders) {
      console.error("[sync-statuses] APIShip failed to return status", {
        apishipOrderId: failure.orderId,
        message: failure.message,
      });
    }

    for (const entry of result.succeedOrders) {
      await processSucceedOrder(companyId, entry, counters);
    }
  }

  return {
    updated: counters.updated,
    events: counters.events,
  };
}
