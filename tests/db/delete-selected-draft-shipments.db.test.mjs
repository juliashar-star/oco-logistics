import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { deleteSelectedDraftShipments } from "../../apps/web/lib/shipments/delete-draft-shipment.ts";
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

async function seedCompany(name, email) {
  return prisma.company.create({ data: { name, contactEmail: email } });
}

/**
 * @param {string} companyId
 * @param {{ status?: import("@prisma/client").ShipmentStatus; providerOrderId?: string | null }} [extra]
 */
async function seedShipment(companyId, extra = {}) {
  return prisma.shipment.create({
    data: {
      companyId,
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
}

describe("deleteSelectedDraftShipments", () => {
  test("(i) all selected are deletable drafts → all go, count is the number deleted", async () => {
    const company = await seedCompany("Acme", "acme@example.com");
    const a = await seedShipment(company.id);
    const b = await seedShipment(company.id);

    const result = await deleteSelectedDraftShipments(
      prisma,
      [a.id, b.id],
      company.id,
    );

    assert.deepEqual(result, { deleted: 2 });
    assert.equal(await prisma.shipment.count({ where: { companyId: company.id } }), 0);
  });

  test("(ii) PARTIAL: a non-draft in the selection survives, the drafts still go", async () => {
    const company = await seedCompany("Acme", "acme2@example.com");
    const draft = await seedShipment(company.id);
    const created = await seedShipment(company.id, { status: "CREATED" });

    const result = await deleteSelectedDraftShipments(
      prisma,
      [draft.id, created.id],
      company.id,
    );

    assert.deepEqual(result, { deleted: 1 });
    assert.equal(await prisma.shipment.findUnique({ where: { id: draft.id } }), null);
    const survivor = await prisma.shipment.findUnique({ where: { id: created.id } });
    assert.equal(survivor?.status, "CREATED");
  });

  test("(iii) a DRAFT that has a providerOrderId is NOT deleted", async () => {
    const company = await seedCompany("Acme", "acme3@example.com");
    const withOrder = await seedShipment(company.id, { providerOrderId: "req-1" });

    const result = await deleteSelectedDraftShipments(
      prisma,
      [withOrder.id],
      company.id,
    );

    assert.deepEqual(result, { deleted: 0 });
    assert.notEqual(await prisma.shipment.findUnique({ where: { id: withOrder.id } }), null);
  });

  test("(iv) another company's DRAFT is never touched, and does not raise the count", async () => {
    const mine = await seedCompany("Mine", "mine@example.com");
    const theirs = await seedCompany("Theirs", "theirs@example.com");
    const myDraft = await seedShipment(mine.id);
    const theirDraft = await seedShipment(theirs.id);

    const result = await deleteSelectedDraftShipments(
      prisma,
      [myDraft.id, theirDraft.id],
      mine.id,
    );

    assert.deepEqual(result, { deleted: 1 });
    assert.notEqual(
      await prisma.shipment.findUnique({ where: { id: theirDraft.id } }),
      null,
    );
  });

  test("(v) unknown ids are simply not matched — no throw, no effect on the count", async () => {
    const company = await seedCompany("Acme", "acme5@example.com");
    const draft = await seedShipment(company.id);

    const result = await deleteSelectedDraftShipments(
      prisma,
      [draft.id, "no-such-id"],
      company.id,
    );

    assert.deepEqual(result, { deleted: 1 });
  });

  test("(vi) empty selection deletes nothing and does not reach the database", async () => {
    const company = await seedCompany("Acme", "acme6@example.com");
    await seedShipment(company.id);

    const result = await deleteSelectedDraftShipments(prisma, [], company.id);

    assert.deepEqual(result, { deleted: 0 });
    assert.equal(await prisma.shipment.count({ where: { companyId: company.id } }), 1);
  });

  test("(vii) children cascade with the deleted drafts", async () => {
    const company = await seedCompany("Acme", "acme7@example.com");
    const draft = await seedShipment(company.id);
    await prisma.trackingEvent.create({
      data: {
        shipmentId: draft.id,
        statusCode: "CREATED",
        statusText: "Создано",
        eventAt: new Date("2026-08-18T10:00:00.000Z"),
      },
    });

    const result = await deleteSelectedDraftShipments(prisma, [draft.id], company.id);

    assert.deepEqual(result, { deleted: 1 });
    assert.equal(await prisma.trackingEvent.count({ where: { shipmentId: draft.id } }), 0);
  });
});
