import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { deleteDraftShipment } from "../../apps/web/lib/shipments/delete-draft-shipment.ts";
import { getTestPrisma, truncateAll } from "../helpers/test-db.mjs";

/** @type {import("@prisma/client").PrismaClient} */
let prisma;

beforeEach(async () => {
  prisma = getTestPrisma();
  await truncateAll(prisma);
});

afterEach(async () => {
  await truncateAll(prisma);
  await prisma.$disconnect();
});

/**
 * @param {string} companyName
 * @param {string} email
 * @param {{ status?: import("@prisma/client").ShipmentStatus; providerOrderId?: string | null }} [extra]
 */
async function seedShipment(companyName, email, extra = {}) {
  const company = await prisma.company.create({
    data: {
      name: companyName,
      contactEmail: email,
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
      status: extra.status ?? "DRAFT",
      ...(extra.providerOrderId !== undefined
        ? { providerOrderId: extra.providerOrderId }
        : {}),
    },
  });
  return { company, shipment };
}

/** Same 404 body the DELETE route returns for not-found / not-yours / not-deletable. */
function notFoundResponse() {
  return { error: "Отправление не найдено" };
}

function toHttpResult(result) {
  if (!result.ok) {
    return { status: 404, body: notFoundResponse() };
  }
  return { status: 200, body: { ok: true } };
}

// Real Postgres + shared truncate: must run serially.
describe("deleteDraftShipment", { concurrency: false }, () => {
  test("(i) DRAFT with no children → deleted, response ok, row gone", async () => {
    const { company, shipment } = await seedShipment(
      "Delete Draft Co",
      `delete-draft-${Date.now()}@example.com`,
    );

    const result = await deleteDraftShipment(prisma, shipment.id, company.id);
    assert.deepEqual(toHttpResult(result), { status: 200, body: { ok: true } });

    const row = await prisma.shipment.findUnique({ where: { id: shipment.id } });
    assert.equal(row, null);
  });

  test("(ii) DRAFT with TrackingEvent + TariffQuote → cascade deletes both children", async () => {
    const { company, shipment } = await seedShipment(
      "Cascade Co",
      `delete-cascade-${Date.now()}@example.com`,
    );
    const carrier = await prisma.carrier.create({
      data: {
        apishipCode: `test-cascade-${Date.now()}`,
        name: "Test Carrier",
      },
    });
    const event = await prisma.trackingEvent.create({
      data: {
        shipmentId: shipment.id,
        statusCode: "DRAFT_NOTE",
        statusText: "черновик",
        eventAt: new Date("2026-07-28T10:00:00.000Z"),
      },
    });
    const quote = await prisma.tariffQuote.create({
      data: {
        shipmentId: shipment.id,
        companyId: company.id,
        carrierId: carrier.id,
        serviceCode: "test",
        cost: 10000,
        pickupType: "COURIER",
      },
    });

    const result = await deleteDraftShipment(prisma, shipment.id, company.id);
    assert.deepEqual(toHttpResult(result), { status: 200, body: { ok: true } });

    assert.equal(await prisma.shipment.findUnique({ where: { id: shipment.id } }), null);
    assert.equal(
      await prisma.trackingEvent.findUnique({ where: { id: event.id } }),
      null,
    );
    assert.equal(await prisma.tariffQuote.findUnique({ where: { id: quote.id } }), null);
  });

  test("(iii) CREATED shipment is NOT deleted; children remain", async () => {
    const { company, shipment } = await seedShipment(
      "Created Co",
      `delete-created-${Date.now()}@example.com`,
      { status: "CREATED", providerOrderId: "req-keep-1" },
    );
    const carrier = await prisma.carrier.create({
      data: {
        apishipCode: `test-created-${Date.now()}`,
        name: "Created Carrier",
      },
    });
    const event = await prisma.trackingEvent.create({
      data: {
        shipmentId: shipment.id,
        statusCode: "CREATED",
        statusText: "создан",
        eventAt: new Date("2026-07-28T11:00:00.000Z"),
      },
    });
    const quote = await prisma.tariffQuote.create({
      data: {
        shipmentId: shipment.id,
        companyId: company.id,
        carrierId: carrier.id,
        serviceCode: "test",
        cost: 20000,
        pickupType: "PVZ",
      },
    });

    const result = await deleteDraftShipment(prisma, shipment.id, company.id);
    assert.deepEqual(toHttpResult(result), {
      status: 404,
      body: notFoundResponse(),
    });

    assert.ok(await prisma.shipment.findUnique({ where: { id: shipment.id } }));
    assert.ok(await prisma.trackingEvent.findUnique({ where: { id: event.id } }));
    assert.ok(await prisma.tariffQuote.findUnique({ where: { id: quote.id } }));
  });

  test("(iv) another company's DRAFT is NOT deleted; response identical to not-found", async () => {
    const owner = await seedShipment(
      "Owner Co",
      `delete-owner-${Date.now()}@example.com`,
    );
    const other = await prisma.company.create({
      data: {
        name: "Other Co",
        contactEmail: `delete-other-${Date.now()}@example.com`,
      },
    });

    const result = await deleteDraftShipment(
      prisma,
      owner.shipment.id,
      other.id,
    );
    assert.deepEqual(toHttpResult(result), {
      status: 404,
      body: notFoundResponse(),
    });

    assert.ok(
      await prisma.shipment.findUnique({ where: { id: owner.shipment.id } }),
    );
  });

  test("(v) non-existent id returns the same not-found response", async () => {
    const company = await prisma.company.create({
      data: {
        name: "Missing Co",
        contactEmail: `delete-missing-${Date.now()}@example.com`,
      },
    });

    const result = await deleteDraftShipment(
      prisma,
      "nonexistent-shipment-id",
      company.id,
    );
    assert.deepEqual(toHttpResult(result), {
      status: 404,
      body: notFoundResponse(),
    });
  });

  test("(vi) DRAFT with providerOrderId set is NOT deleted; same 404; row survives", async () => {
    const { company, shipment } = await seedShipment(
      "Draft With Order Id Co",
      `delete-draft-poid-${Date.now()}@example.com`,
      { status: "DRAFT", providerOrderId: "req-belt-and-braces-1" },
    );

    const result = await deleteDraftShipment(prisma, shipment.id, company.id);
    assert.deepEqual(toHttpResult(result), {
      status: 404,
      body: notFoundResponse(),
    });

    assert.ok(await prisma.shipment.findUnique({ where: { id: shipment.id } }));
  });
});
