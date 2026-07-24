/**
 * Carrier-neutral status sync. The file and route are still named "yandex" only
 * because /api/shipments/sync-statuses is taken by the legacy APIShip route and
 * both get renamed together when that is removed.
 */
import type { Prisma, PrismaClient, ShipmentStatus } from "@prisma/client";
import type {
  CarrierOrderInfo,
  CarrierOrderInfoResult,
  CarrierTrackingEvent,
} from "@oco/core/carrier-adapter/types";
import { CarrierAuthError } from "@oco/core/carrier-adapter/errors";
import type { StatusSyncAdapter } from "@oco/core/carrier-adapter/status-sync-adapters";

import { formatDateMoscow } from "../date/format-date-moscow";
import { getCarrierCredentials } from "./get-carrier-credentials";

const TERMINAL_STATUSES: ShipmentStatus[] = ["DELIVERED", "RETURNED", "CANCELED"];
const NOT_CONNECTED_LOG_MARKER = "[syncYandexShipmentStatuses] NOT_CONNECTED";
const ORDER_NOT_FOUND_LOG_MARKER =
  "[syncYandexShipmentStatuses] ORDER_NOT_FOUND";
const INFO_FAILED_LOG_MARKER = "[syncYandexShipmentStatuses] INFO_FAILED";
const INFO_NOT_FOUND_LOG_MARKER =
  "[syncYandexShipmentStatuses] INFO_NOT_FOUND";
const UNMAPPED_STATUS_LOG_MARKER =
  "[syncYandexShipmentStatuses] UNMAPPED_STATUS";

/** Ours, not a provider status. mapStatus returns null for unknown codes, so
 *  writing this event never changes Shipment.status. */
const OCO_DELIVERY_DATE_CHANGED = "OCO_DELIVERY_DATE_CHANGED";

export type SyncYandexShipmentStatusesResult = {
  updated: number;
  events: number;
  notFound: number;
  infoFailed: number;
  notConnected: number;
};

export type SyncYandexShipmentStatusesDeps = {
  adapters: Record<string, StatusSyncAdapter>;
};

type ShipmentForSync = {
  id: string;
  providerKey: string;
  providerOrderId: string;
  status: ShipmentStatus;
  arrivedAtPvzAt: Date | null;
  deliveredAt: Date | null;
  isReturned: boolean;
  isCanceled: boolean;
  returnReason: string | null;
  trackNumber: string | null;
  trackingUrl: string | null;
  plannedDeliveryDate: Date | null;
};

function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

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
  mapStatus: StatusSyncAdapter["mapStatus"],
  counters: { updated: number; events: number },
): Promise<number> {
  const sorted = sortEventsByEventAt(events);
  let createdEvents = 0;

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

    const wasNew = !existingEvent;
    if (wasNew) {
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
      createdEvents += 1;
    }

    const mappedStatus = mapStatus(statusCode);
    if (mappedStatus == null) {
      // warn, not error: unmapped is information, not a failure — must not page anyone.
      // Log the code only (not statusText): provider free text; we cannot promise it
      // carries no personal data. The text is not lost — it sits in the TrackingEvent
      // row and can be read from the DB.
      if (wasNew) {
        console.warn(
          UNMAPPED_STATUS_LOG_MARKER,
          JSON.stringify({
            providerKey: shipment.providerKey,
            shipmentId: shipment.id,
            statusCode,
          }),
        );
      }
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
    return createdEvents;
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
    return createdEvents;
  }

  await prisma.shipment.update({
    where: { id: shipment.id },
    data: shipmentUpdates,
  });

  if (mappedStatus !== shipment.status) {
    counters.updated += 1;
  }

  return createdEvents;
}

async function applyOrderInfo(
  prisma: PrismaClient,
  shipment: ShipmentForSync,
  info: CarrierOrderInfo,
  counters: { events: number },
): Promise<void> {
  const shipmentUpdates: Prisma.ShipmentUpdateInput = {};

  if (
    isBlank(shipment.trackNumber) &&
    typeof info.trackingNumber === "string" &&
    info.trackingNumber.length > 0
  ) {
    shipmentUpdates.trackNumber = info.trackingNumber;
  }

  if (
    isBlank(shipment.trackingUrl) &&
    typeof info.trackingUrl === "string" &&
    info.trackingUrl.length > 0
  ) {
    shipmentUpdates.trackingUrl = info.trackingUrl;
  }

  const parsedFrom =
    typeof info.plannedDeliveryFrom === "string"
      ? parseEventAt(info.plannedDeliveryFrom)
      : null;

  if (parsedFrom != null) {
    const held = shipment.plannedDeliveryDate;
    if (held == null) {
      // First fill is learning the date, not a reschedule the seller quoted.
      shipmentUpdates.plannedDeliveryDate = parsedFrom;
    } else if (held.getTime() !== parsedFrom.getTime()) {
      shipmentUpdates.plannedDeliveryDate = parsedFrom;

      const wasLabel = formatDateMoscow(held);
      const nowLabel = formatDateMoscow(parsedFrom);

      // Plain create — eventAt is always fresh, so the composite unique key
      // (shipmentId, statusCode, eventAt) cannot collide with a prior row; the
      // findUnique-then-upsert guard used for provider events would be dead
      // code here. Two real reschedules SHOULD produce two entries.
      await prisma.trackingEvent.create({
        data: {
          shipmentId: shipment.id,
          statusCode: OCO_DELIVERY_DATE_CHANGED,
          statusText: `Перевозчик изменил срок доставки: ${wasLabel} → ${nowLabel}`,
          eventAt: new Date(),
        },
      });
      counters.events += 1;
    }
  }

  if (Object.keys(shipmentUpdates).length === 0) {
    return;
  }

  await prisma.shipment.update({
    where: { id: shipment.id },
    data: shipmentUpdates,
  });
}

function emptyResult(): SyncYandexShipmentStatusesResult {
  return { updated: 0, events: 0, notFound: 0, infoFailed: 0, notConnected: 0 };
}

/**
 * Sync shipment statuses from carrier history/info into TrackingEvent + Shipment.
 * Inject adapters so db tests need no network (submitOrder precedent). Faults from
 * getOrderHistory propagate — a broken token is an incident, not a skip. getOrderInfo
 * faults (except CarrierAuthError) are per-row. Missing credentials for one provider
 * skip that provider's rows without aborting the rest.
 */
export async function syncYandexShipmentStatuses(
  prisma: PrismaClient,
  companyId: string,
  deps: SyncYandexShipmentStatusesDeps,
): Promise<SyncYandexShipmentStatusesResult> {
  const adapterKeys = Object.keys(deps.adapters);
  if (adapterKeys.length === 0) {
    return emptyResult();
  }

  const rows = await prisma.shipment.findMany({
    where: {
      companyId,
      providerKey: { in: adapterKeys },
      providerOrderId: { not: null },
      status: { notIn: TERMINAL_STATUSES },
    },
    select: {
      id: true,
      providerKey: true,
      providerOrderId: true,
      status: true,
      arrivedAtPvzAt: true,
      deliveredAt: true,
      isReturned: true,
      isCanceled: true,
      returnReason: true,
      trackNumber: true,
      trackingUrl: true,
      plannedDeliveryDate: true,
    },
  });

  const shipments: ShipmentForSync[] = rows.flatMap((row) => {
    if (!row.providerOrderId || !row.providerKey) {
      return [];
    }
    return [
      {
        id: row.id,
        providerKey: row.providerKey,
        providerOrderId: row.providerOrderId,
        status: row.status,
        arrivedAtPvzAt: row.arrivedAtPvzAt,
        deliveredAt: row.deliveredAt,
        isReturned: row.isReturned,
        isCanceled: row.isCanceled,
        returnReason: row.returnReason,
        trackNumber: row.trackNumber,
        trackingUrl: row.trackingUrl,
        plannedDeliveryDate: row.plannedDeliveryDate,
      },
    ];
  });

  if (shipments.length === 0) {
    return emptyResult();
  }

  const byProvider = new Map<string, ShipmentForSync[]>();
  for (const shipment of shipments) {
    const list = byProvider.get(shipment.providerKey) ?? [];
    list.push(shipment);
    byProvider.set(shipment.providerKey, list);
  }

  const counters = {
    updated: 0,
    events: 0,
    notFound: 0,
    infoFailed: 0,
    notConnected: 0,
  };

  for (const [providerKey, providerShipments] of byProvider) {
    const adapter = deps.adapters[providerKey];
    if (!adapter) {
      continue;
    }

    const credsResult = await getCarrierCredentials(
      prisma,
      companyId,
      providerKey,
    );
    if (!credsResult.ok) {
      console.error(
        NOT_CONNECTED_LOG_MARKER,
        JSON.stringify({ companyId, providerKey }),
      );
      counters.notConnected += providerShipments.length;
      continue;
    }

    for (const shipment of providerShipments) {
      const history = await adapter.getOrderHistory(
        shipment.providerOrderId,
        credsResult.credentials,
      );

      if (!history.ok) {
        // Provider not knowing an id we hold is our inconsistency, not evidence
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

      const createdEvents = await processShipmentHistory(
        prisma,
        shipment,
        history.events,
        adapter.mapStatus,
        counters,
      );

      const needInfo =
        createdEvents > 0 ||
        isBlank(shipment.trackNumber) ||
        isBlank(shipment.trackingUrl);

      if (!needInfo) {
        continue;
      }

      // getOrderInfo is enrichment, not the substance of the sync. A provider
      // 500 on info must not abort status updates for every other shipment.
      let infoResult: CarrierOrderInfoResult;
      try {
        infoResult = await adapter.getOrderInfo(
          shipment.providerOrderId,
          credsResult.credentials,
        );
      } catch (error) {
        if (error instanceof CarrierAuthError) {
          throw error;
        }
        counters.infoFailed += 1;
        console.error(INFO_FAILED_LOG_MARKER, {
          companyId,
          shipmentId: shipment.id,
          error,
        });
        continue;
      }

      if (!infoResult.ok) {
        // History succeeded; only enrichment failed. Do not count as notFound —
        // the UI treats notFound as «orders did not update».
        counters.infoFailed += 1;
        console.error(
          INFO_NOT_FOUND_LOG_MARKER,
          JSON.stringify({
            companyId,
            shipmentId: shipment.id,
            providerOrderId: shipment.providerOrderId,
          }),
        );
        continue;
      }

      await applyOrderInfo(prisma, shipment, infoResult.info, counters);
    }
  }

  return {
    updated: counters.updated,
    events: counters.events,
    notFound: counters.notFound,
    infoFailed: counters.infoFailed,
    notConnected: counters.notConnected,
  };
}
