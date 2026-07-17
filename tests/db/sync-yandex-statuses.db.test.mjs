import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, test } from "node:test";

import { encryptCarrierCredentials } from "../../apps/web/lib/carrier-credentials.ts";
import { syncYandexShipmentStatuses } from "../../apps/web/lib/shipments/sync-yandex-statuses.ts";
import { getTestPrisma, truncateAll } from "../helpers/test-db.mjs";

const ENV_KEY = "CARRIER_CREDENTIALS_ENCRYPTION_KEY";
const TEST_ENCRYPTION_KEY = `test-yandex-sync-${randomBytes(24).toString("hex")}`;
assert.ok(TEST_ENCRYPTION_KEY.length >= 32);

const PROVIDER_YANDEX = "yataxi";
const CREDS = { platformStationId: "station-1", token: "test-token" };

/** @type {import("@prisma/client").PrismaClient} */
let prisma;

function setEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

async function withEnv(name, value, run) {
  const saved = process.env[name];
  setEnv(name, value);
  try {
    return await run();
  } finally {
    setEnv(name, saved);
  }
}

/**
 * @param {string} companyName
 * @param {string} email
 * @param {{
 *   status?: import("@prisma/client").ShipmentStatus,
 *   providerOrderId?: string | null,
 *   providerKey?: string | null,
 * }} [extra]
 */
async function seedYandexShipment(companyName, email, extra = {}) {
  const company = await prisma.company.create({
    data: { name: companyName, contactEmail: email },
  });
  await prisma.carrierCredential.create({
    data: {
      companyId: company.id,
      providerKey: PROVIDER_YANDEX,
      credentialsEnc: encryptCarrierCredentials(CREDS),
    },
  });
  const shipment = await prisma.shipment.create({
    data: {
      companyId: company.id,
      weightG: 500,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
      destCity: "Москва",
      recipientName: "Test Recipient",
      recipientPhone: "+79001234567",
      status: extra.status ?? "CREATED",
      providerKey: extra.providerKey === undefined ? PROVIDER_YANDEX : extra.providerKey,
      providerOrderId:
        extra.providerOrderId === undefined
          ? `req-${Date.now()}-${Math.random()}`
          : extra.providerOrderId,
      idempotencyKey: `idem-${Date.now()}-${Math.random()}`,
    },
  });
  return { company, shipment };
}

beforeEach(async () => {
  prisma = getTestPrisma();
  await truncateAll(prisma);
});

afterEach(async () => {
  await truncateAll(prisma);
  await prisma.$disconnect();
});

// Real Postgres + shared truncate: serial only.
describe("syncYandexShipmentStatuses", { concurrency: false }, () => {
  test("(i) two-event history → two TrackingEvents + status from last non-null map", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const { company, shipment } = await seedYandexShipment(
        "Two Event Co",
        `sync-two-${Date.now()}@example.com`,
      );

      const result = await syncYandexShipmentStatuses(prisma, company.id, {
        getHistory: async () => ({
          ok: true,
          events: [
            {
              statusCode: "CREATED",
              statusText: "Принят",
              eventAt: "2026-07-17T10:00:00.000Z",
              raw: { status: "CREATED" },
            },
            {
              statusCode: "SORTING_CENTER_AT_START",
              statusText: "В точке приема",
              eventAt: "2026-07-17T12:00:00.000Z",
              raw: { status: "SORTING_CENTER_AT_START" },
            },
          ],
        }),
      });

      assert.deepEqual(result, { updated: 1, events: 2, notFound: 0 });
      const row = await prisma.shipment.findUnique({ where: { id: shipment.id } });
      assert.equal(row?.status, "IN_TRANSIT");
      const events = await prisma.trackingEvent.findMany({
        where: { shipmentId: shipment.id },
        orderBy: { eventAt: "asc" },
      });
      assert.equal(events.length, 2);
      assert.equal(events[0].statusCode, "CREATED");
      assert.equal(events[1].statusCode, "SORTING_CENTER_AT_START");
    });
  });

  test("(ii) COUNTEREXAMPLE: ends on DELIVERY_TIME_INTERVALS_UPDATED → IN_TRANSIT not CREATED", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const { company, shipment } = await seedYandexShipment(
        "Counterexample Co",
        `sync-counter-${Date.now()}@example.com`,
      );

      const result = await syncYandexShipmentStatuses(prisma, company.id, {
        getHistory: async () => ({
          ok: true,
          events: [
            {
              statusCode: "CREATED",
              statusText: "Принят",
              eventAt: "2026-07-17T10:00:00.000Z",
            },
            {
              statusCode: "SORTING_CENTER_AT_START",
              statusText: "В точке приема",
              eventAt: "2026-07-17T11:00:00.000Z",
            },
            {
              statusCode: "DELIVERY_TIME_INTERVALS_UPDATED",
              statusText: "Интервал обновлен",
              eventAt: "2026-07-17T12:00:00.000Z",
            },
          ],
        }),
      });

      assert.equal(result.updated, 1);
      assert.equal(result.events, 3);
      const row = await prisma.shipment.findUnique({ where: { id: shipment.id } });
      assert.equal(row?.status, "IN_TRANSIT");
      assert.notEqual(row?.status, "CREATED");
    });
  });

  test("(iii) events out of chronological order → sorted, same result", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const { company, shipment } = await seedYandexShipment(
        "Out Of Order Co",
        `sync-ooo-${Date.now()}@example.com`,
      );

      await syncYandexShipmentStatuses(prisma, company.id, {
        getHistory: async () => ({
          ok: true,
          events: [
            {
              statusCode: "SORTING_CENTER_AT_START",
              statusText: "В точке приема",
              eventAt: "2026-07-17T12:00:00.000Z",
            },
            {
              statusCode: "CREATED",
              statusText: "Принят",
              eventAt: "2026-07-17T10:00:00.000Z",
            },
          ],
        }),
      });

      const row = await prisma.shipment.findUnique({ where: { id: shipment.id } });
      assert.equal(row?.status, "IN_TRANSIT");
      const events = await prisma.trackingEvent.findMany({
        where: { shipmentId: shipment.id },
        orderBy: { eventAt: "asc" },
      });
      assert.equal(events[0].statusCode, "CREATED");
      assert.equal(events[1].statusCode, "SORTING_CENTER_AT_START");
    });
  });

  test("(iv) re-run same sync → no duplicate TrackingEvents, events counter 0", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const { company } = await seedYandexShipment(
        "Idempotent Co",
        `sync-idem-${Date.now()}@example.com`,
      );
      const history = {
        ok: true,
        events: [
          {
            statusCode: "CREATED",
            statusText: "Принят",
            eventAt: "2026-07-17T10:00:00.000Z",
          },
          {
            statusCode: "SORTING_CENTER_AT_START",
            statusText: "В точке приема",
            eventAt: "2026-07-17T12:00:00.000Z",
          },
        ],
      };

      const first = await syncYandexShipmentStatuses(prisma, company.id, {
        getHistory: async () => history,
      });
      assert.equal(first.events, 2);
      assert.equal(first.updated, 1);

      const second = await syncYandexShipmentStatuses(prisma, company.id, {
        getHistory: async () => history,
      });
      assert.equal(second.events, 0);
      assert.equal(second.updated, 0);

      const count = await prisma.trackingEvent.count({
        where: {
          shipment: { companyId: company.id },
        },
      });
      assert.equal(count, 2);
    });
  });

  test("(v) DELIVERY_ARRIVED_PICKUP_POINT → AT_PVZ + arrivedAtPvzAt from event", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const { company, shipment } = await seedYandexShipment(
        "At Pvz Co",
        `sync-pvz-${Date.now()}@example.com`,
      );
      const eventAt = "2026-07-18T09:30:00.000Z";

      await syncYandexShipmentStatuses(prisma, company.id, {
        getHistory: async () => ({
          ok: true,
          events: [
            {
              statusCode: "DELIVERY_ARRIVED_PICKUP_POINT",
              statusText: "В ПВЗ",
              eventAt,
            },
          ],
        }),
      });

      const row = await prisma.shipment.findUnique({ where: { id: shipment.id } });
      assert.equal(row?.status, "AT_PVZ");
      assert.ok(row?.arrivedAtPvzAt instanceof Date);
      assert.equal(row.arrivedAtPvzAt.toISOString(), new Date(eventAt).toISOString());
    });
  });

  test("(vi) CANCELLED → CANCELED, isCanceled true, returnReason set", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const { company, shipment } = await seedYandexShipment(
        "Cancel Co",
        `sync-cancel-${Date.now()}@example.com`,
      );

      await syncYandexShipmentStatuses(prisma, company.id, {
        getHistory: async () => ({
          ok: true,
          events: [
            {
              statusCode: "CANCELLED",
              statusText: "Отменен",
              eventAt: "2026-07-17T15:00:00.000Z",
            },
          ],
        }),
      });

      const row = await prisma.shipment.findUnique({ where: { id: shipment.id } });
      assert.equal(row?.status, "CANCELED");
      assert.equal(row?.isCanceled, true);
      assert.equal(row?.returnReason, "CANCELLED");
    });
  });

  test("(vii) only unmappable codes → status untouched, TrackingEvents still written", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const { company, shipment } = await seedYandexShipment(
        "Unmappable Co",
        `sync-unmap-${Date.now()}@example.com`,
        { status: "CREATED" },
      );

      const result = await syncYandexShipmentStatuses(prisma, company.id, {
        getHistory: async () => ({
          ok: true,
          events: [
            {
              statusCode: "DELIVERY_TIME_INTERVALS_UPDATED",
              statusText: "Интервал",
              eventAt: "2026-07-17T10:00:00.000Z",
            },
            {
              statusCode: "CONFIRMATION_CODE_RECEIVED",
              statusText: "Код",
              eventAt: "2026-07-17T11:00:00.000Z",
            },
          ],
        }),
      });

      assert.equal(result.updated, 0);
      assert.equal(result.events, 2);
      const row = await prisma.shipment.findUnique({ where: { id: shipment.id } });
      assert.equal(row?.status, "CREATED");
      const count = await prisma.trackingEvent.count({
        where: { shipmentId: shipment.id },
      });
      assert.equal(count, 2);
    });
  });

  test("(viii) order_not_found → counted, status untouched", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const { company, shipment } = await seedYandexShipment(
        "Not Found Co",
        `sync-nf-${Date.now()}@example.com`,
        { status: "IN_TRANSIT" },
      );

      const result = await syncYandexShipmentStatuses(prisma, company.id, {
        getHistory: async () => ({ ok: false, reason: "order_not_found" }),
      });

      assert.deepEqual(result, { updated: 0, events: 0, notFound: 1 });
      const row = await prisma.shipment.findUnique({ where: { id: shipment.id } });
      assert.equal(row?.status, "IN_TRANSIT");
      const count = await prisma.trackingEvent.count({
        where: { shipmentId: shipment.id },
      });
      assert.equal(count, 0);
    });
  });

  test("(ix) terminal shipments are not selected", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const { company, shipment } = await seedYandexShipment(
        "Terminal Co",
        `sync-term-${Date.now()}@example.com`,
        { status: "DELIVERED" },
      );

      let getHistoryCalls = 0;
      const result = await syncYandexShipmentStatuses(prisma, company.id, {
        getHistory: async () => {
          getHistoryCalls += 1;
          return {
            ok: true,
            events: [
              {
                statusCode: "CANCELLED",
                statusText: "should-not-run",
                eventAt: "2026-07-17T10:00:00.000Z",
              },
            ],
          };
        },
      });

      assert.deepEqual(result, { updated: 0, events: 0, notFound: 0 });
      assert.equal(getHistoryCalls, 0);
      const row = await prisma.shipment.findUnique({ where: { id: shipment.id } });
      assert.equal(row?.status, "DELIVERED");
    });
  });

  test("(x) company scoping: another company's yataxi shipment untouched", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const { company: a } = await seedYandexShipment(
        "Scope A",
        `sync-a-${Date.now()}@example.com`,
      );
      const { company: b, shipment: bShip } = await seedYandexShipment(
        "Scope B",
        `sync-b-${Date.now()}@example.com`,
      );

      await syncYandexShipmentStatuses(prisma, a.id, {
        getHistory: async () => ({
          ok: true,
          events: [
            {
              statusCode: "SORTING_CENTER_AT_START",
              statusText: "В точке приема",
              eventAt: "2026-07-17T12:00:00.000Z",
            },
          ],
        }),
      });

      const rowB = await prisma.shipment.findUnique({ where: { id: bShip.id } });
      assert.equal(rowB?.status, "CREATED");
      const bEvents = await prisma.trackingEvent.count({
        where: { shipmentId: bShip.id },
      });
      assert.equal(bEvents, 0);
      void b;
    });
  });
});
