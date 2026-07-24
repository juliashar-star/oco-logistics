import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, test } from "node:test";

import { encryptCarrierCredentials } from "../../apps/web/lib/carrier-credentials.ts";
import { syncYandexShipmentStatuses } from "../../apps/web/lib/shipments/sync-yandex-statuses.ts";
import { YandexAuthError } from "../../packages/core/src/carrier-adapter/yandex/client.ts";
import { mapYandexStatusToShipmentStatus } from "../../packages/core/src/carrier-adapter/yandex/map-status.ts";
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

const EMPTY_INFO = async () => ({ ok: true, info: {} });

/**
 * @param {{
 *   getHistory: Function,
 *   getInfo: Function,
 *   mapStatus?: (statusCode: string) => import("@prisma/client").ShipmentStatus | null,
 * }} stubs
 */
function adaptersWith(stubs) {
  return {
    adapters: {
      yataxi: {
        providerKey: PROVIDER_YANDEX,
        getOrderHistory: stubs.getHistory,
        getOrderInfo: stubs.getInfo,
        mapStatus: stubs.mapStatus ?? mapYandexStatusToShipmentStatus,
      },
    },
  };
}

/**
 * @param {string} companyName
 * @param {string} email
 * @param {{
 *   status?: import("@prisma/client").ShipmentStatus,
 *   providerOrderId?: string | null,
 *   providerKey?: string | null,
 *   trackNumber?: string | null,
 *   trackingUrl?: string | null,
 *   plannedDeliveryDate?: Date | null,
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
      ...(extra.trackNumber !== undefined ? { trackNumber: extra.trackNumber } : {}),
      ...(extra.trackingUrl !== undefined ? { trackingUrl: extra.trackingUrl } : {}),
      ...(extra.plannedDeliveryDate !== undefined
        ? { plannedDeliveryDate: extra.plannedDeliveryDate }
        : {}),
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

      const result = await syncYandexShipmentStatuses(prisma, company.id, adaptersWith({
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
        getInfo: EMPTY_INFO,
      }));

      assert.deepEqual(result, { updated: 1, events: 2, notFound: 0, infoFailed: 0, notConnected: 0 });
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

      const result = await syncYandexShipmentStatuses(prisma, company.id, adaptersWith({
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
        getInfo: EMPTY_INFO,
      }));

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

      await syncYandexShipmentStatuses(prisma, company.id, adaptersWith({
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
        getInfo: EMPTY_INFO,
      }));

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
        {
          trackNumber: "10014440",
          trackingUrl: "https://example.test/track/1",
        },
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

      const first = await syncYandexShipmentStatuses(prisma, company.id, adaptersWith({
        getHistory: async () => history,
        getInfo: EMPTY_INFO,
      }));
      assert.equal(first.events, 2);
      assert.equal(first.updated, 1);

      const second = await syncYandexShipmentStatuses(prisma, company.id, adaptersWith({
        getHistory: async () => history,
        getInfo: EMPTY_INFO,
      }));
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

      await syncYandexShipmentStatuses(prisma, company.id, adaptersWith({
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
        getInfo: EMPTY_INFO,
      }));

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

      await syncYandexShipmentStatuses(prisma, company.id, adaptersWith({
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
        getInfo: EMPTY_INFO,
      }));

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

      const result = await syncYandexShipmentStatuses(prisma, company.id, adaptersWith({
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
        getInfo: EMPTY_INFO,
      }));

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

      const result = await syncYandexShipmentStatuses(prisma, company.id, adaptersWith({
        getHistory: async () => ({ ok: false, reason: "order_not_found" }),
        getInfo: EMPTY_INFO,
      }));

      assert.deepEqual(result, { updated: 0, events: 0, notFound: 1, infoFailed: 0, notConnected: 0 });
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
      const result = await syncYandexShipmentStatuses(prisma, company.id, adaptersWith({
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
        getInfo: EMPTY_INFO,
      }));

      assert.deepEqual(result, { updated: 0, events: 0, notFound: 0, infoFailed: 0, notConnected: 0 });
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

      await syncYandexShipmentStatuses(prisma, a.id, adaptersWith({
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
        getInfo: EMPTY_INFO,
      }));

      const rowB = await prisma.shipment.findUnique({ where: { id: bShip.id } });
      assert.equal(rowB?.status, "CREATED");
      const bEvents = await prisma.trackingEvent.count({
        where: { shipmentId: bShip.id },
      });
      assert.equal(bEvents, 0);
      void b;
    });
  });

  test("(xi) new event + empty columns → trackNumber, trackingUrl, plannedDeliveryDate filled", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const { company, shipment } = await seedYandexShipment(
        "Fill Info Co",
        `sync-fill-${Date.now()}@example.com`,
      );

      await syncYandexShipmentStatuses(prisma, company.id, adaptersWith({
        getHistory: async () => ({
          ok: true,
          events: [
            {
              statusCode: "CREATED",
              statusText: "Принят",
              eventAt: "2026-07-17T10:00:00.000Z",
            },
          ],
        }),
        getInfo: async () => ({
          ok: true,
          info: {
            trackingNumber: "10014440",
            trackingUrl:
              "https://logistics-frontend.taxi.tst.yandex.ru/route/abc",
            plannedDeliveryFrom: "2026-07-27T06:00:00+0000",
            plannedDeliveryTo: "2026-07-27T15:00:00+0000",
          },
        }),
      }));

      const row = await prisma.shipment.findUnique({ where: { id: shipment.id } });
      assert.equal(row?.trackNumber, "10014440");
      assert.equal(
        row?.trackingUrl,
        "https://logistics-frontend.taxi.tst.yandex.ru/route/abc",
      );
      assert.equal(
        row?.plannedDeliveryDate?.toISOString(),
        new Date("2026-07-27T06:00:00+0000").toISOString(),
      );
    });
  });

  test("(xii) columns already filled, no new events → getInfo NOT called", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const heldDate = new Date("2026-07-27T06:00:00.000Z");
      const { company, shipment } = await seedYandexShipment(
        "Skip Info Co",
        `sync-skip-${Date.now()}@example.com`,
        {
          trackNumber: "10014440",
          trackingUrl: "https://example.test/track/1",
          plannedDeliveryDate: heldDate,
        },
      );
      await prisma.trackingEvent.create({
        data: {
          shipmentId: shipment.id,
          statusCode: "CREATED",
          statusText: "Принят",
          eventAt: new Date("2026-07-17T10:00:00.000Z"),
        },
      });

      let getInfoCalls = 0;
      await syncYandexShipmentStatuses(prisma, company.id, adaptersWith({
        getHistory: async () => ({
          ok: true,
          events: [
            {
              statusCode: "CREATED",
              statusText: "Принят",
              eventAt: "2026-07-17T10:00:00.000Z",
            },
          ],
        }),
        getInfo: async () => {
          getInfoCalls += 1;
          return { ok: true, info: {} };
        },
      }));

      assert.equal(getInfoCalls, 0);
    });
  });

  test("(xiii) no new events but trackingUrl empty → getInfo IS called", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const { company, shipment } = await seedYandexShipment(
        "Url Empty Co",
        `sync-url-${Date.now()}@example.com`,
        { trackNumber: "10014440", trackingUrl: null },
      );
      await prisma.trackingEvent.create({
        data: {
          shipmentId: shipment.id,
          statusCode: "CREATED",
          statusText: "Принят",
          eventAt: new Date("2026-07-17T10:00:00.000Z"),
        },
      });

      let getInfoCalls = 0;
      await syncYandexShipmentStatuses(prisma, company.id, adaptersWith({
        getHistory: async () => ({
          ok: true,
          events: [
            {
              statusCode: "CREATED",
              statusText: "Принят",
              eventAt: "2026-07-17T10:00:00.000Z",
            },
          ],
        }),
        getInfo: async () => {
          getInfoCalls += 1;
          return {
            ok: true,
            info: { trackingUrl: "https://example.test/track/filled" },
          };
        },
      }));

      assert.equal(getInfoCalls, 1);
      const row = await prisma.shipment.findUnique({ where: { id: shipment.id } });
      assert.equal(row?.trackingUrl, "https://example.test/track/filled");
    });
  });

  test("(xiv) plannedDeliveryDate differs → column updated + OCO_DELIVERY_DATE_CHANGED", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const heldDate = new Date("2026-07-27T06:00:00.000Z");
      const { company, shipment } = await seedYandexShipment(
        "Date Change Co",
        `sync-date-${Date.now()}@example.com`,
        {
          trackNumber: "10014440",
          trackingUrl: "https://example.test/track/1",
          plannedDeliveryDate: heldDate,
        },
      );

      await syncYandexShipmentStatuses(prisma, company.id, adaptersWith({
        getHistory: async () => ({
          ok: true,
          events: [
            {
              statusCode: "CREATED",
              statusText: "Принят",
              eventAt: "2026-07-17T10:00:00.000Z",
            },
          ],
        }),
        getInfo: async () => ({
          ok: true,
          info: {
            plannedDeliveryFrom: "2026-07-28T06:00:00+0000",
          },
        }),
      }));

      const row = await prisma.shipment.findUnique({ where: { id: shipment.id } });
      assert.equal(
        row?.plannedDeliveryDate?.toISOString(),
        new Date("2026-07-28T06:00:00+0000").toISOString(),
      );
      const oco = await prisma.trackingEvent.findFirst({
        where: {
          shipmentId: shipment.id,
          statusCode: "OCO_DELIVERY_DATE_CHANGED",
        },
      });
      assert.ok(oco);
      assert.match(oco.statusText, /27\.07\.2026/);
      assert.match(oco.statusText, /28\.07\.2026/);
      assert.match(oco.statusText, /→/);
    });
  });

  test("(xv) plannedDeliveryDate identical → no new event, no write", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const heldDate = new Date("2026-07-27T06:00:00.000Z");
      const { company, shipment } = await seedYandexShipment(
        "Date Same Co",
        `sync-same-${Date.now()}@example.com`,
        {
          trackNumber: "10014440",
          trackingUrl: "https://example.test/track/1",
          plannedDeliveryDate: heldDate,
        },
      );

      const result = await syncYandexShipmentStatuses(prisma, company.id, adaptersWith({
        getHistory: async () => ({
          ok: true,
          events: [
            {
              statusCode: "CREATED",
              statusText: "Принят",
              eventAt: "2026-07-17T10:00:00.000Z",
            },
          ],
        }),
        getInfo: async () => ({
          ok: true,
          info: {
            plannedDeliveryFrom: "2026-07-27T06:00:00.000Z",
          },
        }),
      }));

      // One provider CREATED event only — no OCO date-change event.
      assert.equal(result.events, 1);
      const ocoCount = await prisma.trackingEvent.count({
        where: {
          shipmentId: shipment.id,
          statusCode: "OCO_DELIVERY_DATE_CHANGED",
        },
      });
      assert.equal(ocoCount, 0);
      const row = await prisma.shipment.findUnique({ where: { id: shipment.id } });
      assert.equal(row?.plannedDeliveryDate?.toISOString(), heldDate.toISOString());
    });
  });

  test("(xvi) getInfo order_not_found → row untouched, sync completes", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const { company, shipment } = await seedYandexShipment(
        "Info Nf Co",
        `sync-infonf-${Date.now()}@example.com`,
        { status: "CREATED" },
      );

      const result = await syncYandexShipmentStatuses(prisma, company.id, adaptersWith({
        getHistory: async () => ({
          ok: true,
          events: [
            {
              statusCode: "CREATED",
              statusText: "Принят",
              eventAt: "2026-07-17T10:00:00.000Z",
            },
          ],
        }),
        getInfo: async () => ({ ok: false, reason: "order_not_found" }),
      }));

      assert.equal(result.notFound, 0);
      assert.equal(result.infoFailed, 1);
      assert.equal(result.events, 1);
      const row = await prisma.shipment.findUnique({ where: { id: shipment.id } });
      assert.equal(row?.trackNumber, null);
      assert.equal(row?.trackingUrl, null);
      assert.equal(row?.plannedDeliveryDate, null);
    });
  });

  test("(xvii) trackNumber already set, provider returns different → ours NOT overwritten", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const { company, shipment } = await seedYandexShipment(
        "Keep Track Co",
        `sync-keep-${Date.now()}@example.com`,
        {
          trackNumber: "OURS-KEEP",
          trackingUrl: null,
        },
      );

      await syncYandexShipmentStatuses(prisma, company.id, adaptersWith({
        getHistory: async () => ({
          ok: true,
          events: [
            {
              statusCode: "CREATED",
              statusText: "Принят",
              eventAt: "2026-07-17T10:00:00.000Z",
            },
          ],
        }),
        getInfo: async () => ({
          ok: true,
          info: {
            trackingNumber: "PROVIDER-OTHER",
            trackingUrl: "https://example.test/track/new",
          },
        }),
      }));

      const row = await prisma.shipment.findUnique({ where: { id: shipment.id } });
      assert.equal(row?.trackNumber, "OURS-KEEP");
      assert.equal(row?.trackingUrl, "https://example.test/track/new");
    });
  });

  test("(xviii) getInfo plain Error on A → B still processed, infoFailed 1, A untouched", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const { company, shipment: shipA } = await seedYandexShipment(
        "Info Fail Co",
        `sync-infofail-${Date.now()}@example.com`,
      );
      const shipB = await prisma.shipment.create({
        data: {
          companyId: company.id,
          weightG: 500,
          lengthCm: 10,
          widthCm: 10,
          heightCm: 10,
          destCity: "Москва",
          recipientName: "Recipient B",
          recipientPhone: "+79007654321",
          status: "CREATED",
          providerKey: PROVIDER_YANDEX,
          providerOrderId: `req-b-${Date.now()}-${Math.random()}`,
          idempotencyKey: `idem-b-${Date.now()}-${Math.random()}`,
        },
      });

      const result = await syncYandexShipmentStatuses(prisma, company.id, adaptersWith({
        getHistory: async () => ({
          ok: true,
          events: [
            {
              statusCode: "CREATED",
              statusText: "Принят",
              eventAt: "2026-07-17T10:00:00.000Z",
            },
          ],
        }),
        getInfo: async (providerOrderId) => {
          if (providerOrderId === shipA.providerOrderId) {
            throw new Error("provider info boom");
          }
          return {
            ok: true,
            info: {
              trackingNumber: "TRACK-B",
              trackingUrl: "https://example.test/track/b",
            },
          };
        },
      }));

      assert.equal(result.infoFailed, 1);
      const rowA = await prisma.shipment.findUnique({ where: { id: shipA.id } });
      assert.equal(rowA?.trackNumber, null);
      assert.equal(rowA?.trackingUrl, null);
      const rowB = await prisma.shipment.findUnique({ where: { id: shipB.id } });
      assert.equal(rowB?.trackNumber, "TRACK-B");
      assert.equal(rowB?.trackingUrl, "https://example.test/track/b");
    });
  });

  test("(xix) getInfo YandexAuthError → whole sync rejects", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const { company } = await seedYandexShipment(
        "Auth Fail Co",
        `sync-authfail-${Date.now()}@example.com`,
      );

      await assert.rejects(
        () =>
          syncYandexShipmentStatuses(prisma, company.id, adaptersWith({
            getHistory: async () => ({
              ok: true,
              events: [
                {
                  statusCode: "CREATED",
                  statusText: "Принят",
                  eventAt: "2026-07-17T10:00:00.000Z",
                },
              ],
            }),
            getInfo: async () => {
              throw new YandexAuthError("Yandex Delivery auth failed: HTTP 401");
            },
          })),
        (err) => {
          assert.ok(err instanceof YandexAuthError);
          return true;
        },
      );
    });
  });

  test("(xx) plannedDeliveryDate null → column filled, no OCO_DELIVERY_DATE_CHANGED", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const { company, shipment } = await seedYandexShipment(
        "Date First Co",
        `sync-datefirst-${Date.now()}@example.com`,
        {
          trackNumber: "10014440",
          trackingUrl: "https://example.test/track/1",
          plannedDeliveryDate: null,
        },
      );

      await syncYandexShipmentStatuses(prisma, company.id, adaptersWith({
        getHistory: async () => ({
          ok: true,
          events: [
            {
              statusCode: "CREATED",
              statusText: "Принят",
              eventAt: "2026-07-17T10:00:00.000Z",
            },
          ],
        }),
        getInfo: async () => ({
          ok: true,
          info: {
            plannedDeliveryFrom: "2026-07-27T06:00:00+0000",
          },
        }),
      }));

      const row = await prisma.shipment.findUnique({ where: { id: shipment.id } });
      assert.equal(
        row?.plannedDeliveryDate?.toISOString(),
        new Date("2026-07-27T06:00:00+0000").toISOString(),
      );
      const ocoCount = await prisma.trackingEvent.count({
        where: {
          shipmentId: shipment.id,
          statusCode: "OCO_DELIVERY_DATE_CHANGED",
        },
      });
      assert.equal(ocoCount, 0);
    });
  });

  test("(xxi) two providers, only one connected → connected syncs, notConnected 1, other untouched", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const { company, shipment: yandexShip } = await seedYandexShipment(
        "Two Prov Co",
        `sync-twoprov-${Date.now()}@example.com`,
      );
      const otherShip = await prisma.shipment.create({
        data: {
          companyId: company.id,
          weightG: 500,
          lengthCm: 10,
          widthCm: 10,
          heightCm: 10,
          destCity: "Москва",
          recipientName: "Other Recipient",
          recipientPhone: "+79007654321",
          status: "CREATED",
          providerKey: "othercarrier",
          providerOrderId: `req-other-${Date.now()}-${Math.random()}`,
          idempotencyKey: `idem-other-${Date.now()}-${Math.random()}`,
        },
      });

      const result = await syncYandexShipmentStatuses(prisma, company.id, {
        adapters: {
          yataxi: {
            providerKey: PROVIDER_YANDEX,
            getOrderHistory: async () => ({
              ok: true,
              events: [
                {
                  statusCode: "SORTING_CENTER_AT_START",
                  statusText: "В точке приема",
                  eventAt: "2026-07-17T12:00:00.000Z",
                },
              ],
            }),
            getOrderInfo: EMPTY_INFO,
            mapStatus: mapYandexStatusToShipmentStatus,
          },
          othercarrier: {
            providerKey: "othercarrier",
            getOrderHistory: async () => {
              throw new Error("othercarrier history must not be called");
            },
            getOrderInfo: EMPTY_INFO,
            mapStatus: () => null,
          },
        },
      });

      assert.equal(result.notConnected, 1);
      assert.equal(result.updated, 1);
      const yandexRow = await prisma.shipment.findUnique({
        where: { id: yandexShip.id },
      });
      assert.equal(yandexRow?.status, "IN_TRANSIT");
      const otherRow = await prisma.shipment.findUnique({
        where: { id: otherShip.id },
      });
      assert.equal(otherRow?.status, "CREATED");
      const otherEvents = await prisma.trackingEvent.count({
        where: { shipmentId: otherShip.id },
      });
      assert.equal(otherEvents, 0);
    });
  });

  test("(xxii) providerKey not in adapters → never selected, getOrderHistory never called", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const { company, shipment } = await seedYandexShipment(
        "Unknown Prov Co",
        `sync-unk-${Date.now()}@example.com`,
        { providerKey: "not_in_registry" },
      );

      let historyCalls = 0;
      await syncYandexShipmentStatuses(prisma, company.id, adaptersWith({
        getHistory: async () => {
          historyCalls += 1;
          return { ok: true, events: [] };
        },
        getInfo: EMPTY_INFO,
      }));

      assert.equal(historyCalls, 0);
      const row = await prisma.shipment.findUnique({ where: { id: shipment.id } });
      assert.equal(row?.status, "CREATED");
      assert.equal(row?.providerKey, "not_in_registry");
    });
  });

  test("(xxiii) mapStatus from registry: fake mapper can deliver unknown code", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const { company, shipment } = await seedYandexShipment(
        "Fake Map Co",
        `sync-fakemap-${Date.now()}@example.com`,
      );

      await syncYandexShipmentStatuses(prisma, company.id, adaptersWith({
        getHistory: async () => ({
          ok: true,
          events: [
            {
              statusCode: "MADE_UP_FOR_TEST",
              statusText: "Synthetic",
              eventAt: "2026-07-17T10:00:00.000Z",
            },
          ],
        }),
        getInfo: EMPTY_INFO,
        mapStatus: (code) => (code === "MADE_UP_FOR_TEST" ? "DELIVERED" : null),
      }));

      const row = await prisma.shipment.findUnique({ where: { id: shipment.id } });
      assert.equal(row?.status, "DELIVERED");
      assert.equal(mapYandexStatusToShipmentStatus("MADE_UP_FOR_TEST"), null);
    });
  });
});
