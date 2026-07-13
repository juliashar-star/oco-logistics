import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { captureForSubmit } from "../../apps/web/lib/shipments/capture-for-submit.ts";
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
 */
async function seedDraftShipment(companyName, email) {
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
    },
  });
  return { company, shipment };
}

// Real Postgres + shared truncate: must run serially (default node:test
// concurrency would interleave truncateAll across cases).
describe("captureForSubmit", { concurrency: false }, () => {
  test("(i) single capture on DRAFT -> captured:true, status SUBMITTING, submittingAt set", async () => {
    const { company, shipment } = await seedDraftShipment(
      "Capture Co",
      `capture-single-${Date.now()}@example.com`,
    );

    const result = await captureForSubmit(prisma, shipment.id, company.id);
    assert.deepEqual(result, { captured: true });

    const row = await prisma.shipment.findUnique({ where: { id: shipment.id } });
    assert.ok(row);
    assert.equal(row.status, "SUBMITTING");
    assert.ok(row.submittingAt instanceof Date);
  });

  test("(ii) race: exactly one of two concurrent captures wins (5 iterations)", async () => {
    for (let i = 0; i < 5; i++) {
      await truncateAll(prisma);
      const { company, shipment } = await seedDraftShipment(
        `Race Co ${i}`,
        `capture-race-${Date.now()}-${i}@example.com`,
      );

      const [a, b] = await Promise.all([
        captureForSubmit(prisma, shipment.id, company.id),
        captureForSubmit(prisma, shipment.id, company.id),
      ]);

      const wins = [a, b].filter((r) => r.captured === true);
      const losses = [a, b].filter((r) => r.captured === false);
      assert.equal(wins.length, 1, `iteration ${i}: expected exactly one win`);
      assert.equal(losses.length, 1, `iteration ${i}: expected exactly one loss`);
      assert.deepEqual(losses[0], {
        captured: false,
        reason: "not_draft",
        status: "SUBMITTING",
      });

      const row = await prisma.shipment.findUnique({ where: { id: shipment.id } });
      assert.ok(row);
      assert.equal(row.status, "SUBMITTING");
      assert.ok(row.submittingAt instanceof Date);
    }
  });

  test("(iii) non-existent id -> not_found", async () => {
    const company = await prisma.company.create({
      data: {
        name: "Missing Shipment Co",
        contactEmail: `capture-missing-${Date.now()}@example.com`,
      },
    });

    const result = await captureForSubmit(
      prisma,
      "nonexistent-shipment-id",
      company.id,
    );
    assert.deepEqual(result, { captured: false, reason: "not_found" });
  });

  test("(iv) different companyId -> not_found", async () => {
    const { shipment } = await seedDraftShipment(
      "Owner Co",
      `capture-owner-${Date.now()}@example.com`,
    );
    const other = await prisma.company.create({
      data: {
        name: "Other Co",
        contactEmail: `capture-other-${Date.now()}@example.com`,
      },
    });

    const result = await captureForSubmit(prisma, shipment.id, other.id);
    assert.deepEqual(result, { captured: false, reason: "not_found" });

    const row = await prisma.shipment.findUnique({ where: { id: shipment.id } });
    assert.ok(row);
    assert.equal(row.status, "DRAFT");
  });

  test("(v) already SUBMITTING -> not_draft", async () => {
    const { company, shipment } = await seedDraftShipment(
      "Already Submitting Co",
      `capture-submitting-${Date.now()}@example.com`,
    );
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: { status: "SUBMITTING", submittingAt: new Date() },
    });

    const result = await captureForSubmit(prisma, shipment.id, company.id);
    assert.deepEqual(result, {
      captured: false,
      reason: "not_draft",
      status: "SUBMITTING",
    });
  });
});
