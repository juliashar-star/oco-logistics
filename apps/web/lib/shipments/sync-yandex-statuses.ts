import type { Prisma, PrismaClient, ShipmentStatus } from "@prisma/client";
import type {
  CarrierCredentials,
  CarrierOrderHistoryResult,
  CarrierTrackingEvent,
} from "@oco/core/carrier-adapter/types";
import { mapYandexStatusToShipmentStatus } from "@oco/core/carrier-adapter/yandex/map-status";

import { getCarrierCredentials } from "./get-carrier-credentials";

const TERMINAL_STATUSES: ShipmentStatus[] = ["DELIVERED", "RETURNED", "CANCELED"];
const PROVIDER_KEY_YANDEX = "yataxi";
const NOT_CONNECTED_LOG_MARKER = "[syncYandexShipmentStatuses] NOT_CONNECTED";
const ORDER_NOT_FOUND_LOG_MARKER =
  "[syncYandexShipmentStatuses] ORDER_NOT_FOUND";

export type SyncYandexShipmentStatusesResult = {
  updated: number;
  events: number;
  notFound: number;
};

export type SyncYandexShipmentStatusesDeps = {
  getHistory: (
    providerOrderId: string,
    credentials: CarrierCredentials,
  ) => Promise<CarrierOrderHistoryResult>;
};

type ShipmentForSync = {
  id: string;
  providerOrderId: string;
  status: ShipmentStatus;
  arrivedAtPvzAt: Date | null;
  deliveredAt: Date | null;
  isReturned: boolean;
  isCanceled: boolean;
  returnReason: string | null;
};

function parseEventAt(iso: string): Date | null {
  const trimmed = iso.trim();
  if (!trimmed) {
    return null;
  }
  const eventAt = new Date(trimmed);
  return Number.isNaN(eventAt.getTime()) ? null : eventAt;
}

function buildFactDateUpdates(
  mappedStatus: ShipmentStatus,
  eventAt: Date,
  shipment: Pick<ShipmentForSync, "arrivedAtPvzAt" | "deliveredAt">,
): Pick<Prisma.ShipmentUpdateInput, "arrivedAtPvzAt" | "deliveredAt"> {
  const updates: Pick<Prisma.ShipmentUpdateInput, "arrivedAtPvzAt" | "deliveredAt"> =
    {};

  if (mappedStatus === "AT_PVZ" && shipment.arrivedAtPvzAt == null) {
    updates.arrivedAtPvzAt = eventAt;
  }

  if (mappedStatus === "DELIVERED" && shipment.deliveredAt == null) {
    updates.deliveredAt = eventAt;
  }

  return updates;
}

function sortEventsByEventAt(
  events: CarrierTrackingEvent[],
): CarrierTrackingEvent[] {
  return [...events].sort((a, b) => {
    const aMs = parseEventAt(a.eventAt)?.getTime() ?? Number.POSITIVE_INFINITY;
    const bMs = parseEventAt(b.eventAt)?.getTime() ?? Number.POSITIVE_INFINITY;
    return aMs - bMs;
  });
}

async function processShipmentHistory(
  prisma: PrismaClient,
  shipment: ShipmentForSync,
  events: CarrierTrackingEvent[],
  counters: { updated: number; events: number },
): Promise<void> {
  const sorted = sortEventsByEventAt(events);

  // Working copy of fact dates so later events in this history see earlier ones.
  let arrivedAtPvzAt = shipment.arrivedAtPvzAt;
  let deliveredAt = shipment.deliveredAt;

  /** Last event whose code maps to a real ShipmentStatus — not merely the last
   *  entry. Counterexample: [CREATED, SORTING_CENTER_AT_START,
   *  DELIVERY_TIME_INTERVALS_UPDATED] ends on a reschedule (null); taking the
   *  last entry would leave the row on CREATED even though SORTING_CENTER_AT_START
   *  already means IN_TRANSIT. */
  let lastMapped: {
    status: ShipmentStatus;
    statusCode: string;
    eventAt: Date;
  } | null = null;

  const factDateUpdates: Pick<
    Prisma.ShipmentUpdateInput,
    "arrivedAtPvzAt" | "deliveredAt"
  > = {};

  for (const event of sorted) {
    const eventAt = parseEventAt(event.eventAt);
    if (!eventAt) {
      continue;
    }

    const statusCode = event.statusCode.trim() || "unknown";
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
          statusText: event.statusText,
          eventAt,
          rawResponse:
            event.raw === undefined
              ? undefined
              : (event.raw as Prisma.InputJsonValue),
        },
        update: {},
      });
      counters.events += 1;
    }

    const mappedStatus = mapYandexStatusToShipmentStatus(statusCode);
    if (mappedStatus == null) {
      continue;
    }

    lastMapped = { status: mappedStatus, statusCode, eventAt };

    const facts = buildFactDateUpdates(mappedStatus, eventAt, {
      arrivedAtPvzAt,
      deliveredAt,
    });
    if (facts.arrivedAtPvzAt != null) {
      factDateUpdates.arrivedAtPvzAt = facts.arrivedAtPvzAt;
      arrivedAtPvzAt = facts.arrivedAtPvzAt as Date;
    }
    if (facts.deliveredAt != null) {
      factDateUpdates.deliveredAt = facts.deliveredAt;
      deliveredAt = facts.deliveredAt as Date;
    }
  }

  if (lastMapped == null) {
    // Unmappable-only history: TrackingEvent rows written above; status alone.
    return;
  }

  const mappedStatus = lastMapped.status;
  const shipmentUpdates: Prisma.ShipmentUpdateInput = {
    ...factDateUpdates,
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
    shipmentUpdates.returnReason = lastMapped.statusCode;
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
 * Sync Yandex (yataxi) shipment statuses from request/history into TrackingEvent
 * + Shipment. Inject getHistory so db tests need no network (submitOrder precedent).
 * Faults from getHistory propagate — a broken token is an incident, not a skip.
 */
export async function syncYandexShipmentStatuses(
  prisma: PrismaClient,
  companyId: string,
  deps: SyncYandexShipmentStatusesDeps,
): Promise<SyncYandexShipmentStatusesResult> {
  const rows = await prisma.shipment.findMany({
    where: {
      companyId,
      providerKey: PROVIDER_KEY_YANDEX,
      providerOrderId: { not: null },
      status: { notIn: TERMINAL_STATUSES },
    },
    select: {
      id: true,
      providerOrderId: true,
      status: true,
      arrivedAtPvzAt: true,
      deliveredAt: true,
      isReturned: true,
      isCanceled: true,
      returnReason: true,
    },
  });

  const shipments: ShipmentForSync[] = rows.flatMap((row) => {
    if (!row.providerOrderId) {
      return [];
    }
    return [
      {
        id: row.id,
        providerOrderId: row.providerOrderId,
        status: row.status,
        arrivedAtPvzAt: row.arrivedAtPvzAt,
        deliveredAt: row.deliveredAt,
        isReturned: row.isReturned,
        isCanceled: row.isCanceled,
        returnReason: row.returnReason,
      },
    ];
  });

  if (shipments.length === 0) {
    return { updated: 0, events: 0, notFound: 0 };
  }

  const credsResult = await getCarrierCredentials(
    prisma,
    companyId,
    PROVIDER_KEY_YANDEX,
  );
  // Rows exist that were created WITH yataxi credentials — their absence now
  // is an inconsistency worth logging, not a user case worth throwing over.
  if (!credsResult.ok) {
    console.error(NOT_CONNECTED_LOG_MARKER, JSON.stringify({ companyId }));
    return { updated: 0, events: 0, notFound: 0 };
  }

  const counters = { updated: 0, events: 0, notFound: 0 };

  for (const shipment of shipments) {
    const history = await deps.getHistory(
      shipment.providerOrderId,
      credsResult.credentials,
    );

    if (!history.ok) {
      // Yandex not knowing an id we hold is our inconsistency, not evidence
      // about the order — do not change the row's status.
      counters.notFound += 1;
      console.error(
        ORDER_NOT_FOUND_LOG_MARKER,
        JSON.stringify({
          companyId,
          shipmentId: shipment.id,
          providerOrderId: shipment.providerOrderId,
        }),
      );
      continue;
    }

    await processShipmentHistory(prisma, shipment, history.events, counters);
  }

  return {
    updated: counters.updated,
    events: counters.events,
    notFound: counters.notFound,
  };
}
