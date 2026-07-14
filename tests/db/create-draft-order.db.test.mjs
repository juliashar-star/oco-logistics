import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, test } from "node:test";

import { createDraftOrder } from "../../apps/web/lib/shipments/create-draft-order.ts";
import { getTestPrisma, truncateAll } from "../helpers/test-db.mjs";

const PII_ENV = "RECIPIENT_PII_ENCRYPTION_KEY";
/** Self-contained test key — never read real .env secrets. */
const TEST_PII_KEY = `test-recipient-pii-${randomBytes(24).toString("hex")}`;
assert.ok(TEST_PII_KEY.length >= 32, "test PII key must be >= 32 chars");

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
 */
async function seedCompany(companyName, email) {
  return prisma.company.create({
    data: { name: companyName, contactEmail: email },
  });
}

/**
 * @param {string} companyId
 * @param {string} idempotencyKey
 * @param {Partial<{ legalBasisConfirmed: boolean; recipientName: string; destAddress?: string }>} [overrides]
 */
function draftInput(companyId, idempotencyKey, overrides = {}) {
  return {
    companyId,
    createdByUserId: "user-test-1",
    idempotencyKey,
    category: /** @type {const} */ ("OTHER"),
    weightG: 500,
    lengthCm: 10,
    widthCm: 10,
    heightCm: 10,
    destCity: "Москва",
    destAddress: overrides.destAddress ?? "ул. Тестовая, 1",
    pickupType: /** @type {const} */ ("COURIER"),
    recipientName: overrides.recipientName ?? "Иван Тестов",
    recipientPhone: "+79001234567",
    selectionMode: /** @type {const} */ ("MANUAL"),
    legalBasisConfirmed: overrides.legalBasisConfirmed ?? true,
  };
}

beforeEach(async () => {
  prisma = getTestPrisma();
  await truncateAll(prisma);
});

afterEach(async () => {
  await truncateAll(prisma);
  await prisma.$disconnect();
});

describe("createDraftOrder", { concurrency: false }, () => {
  test("(i) fresh idempotencyKey → created DRAFT, PII encrypted, destCity plaintext", async () => {
    await withEnv(PII_ENV, TEST_PII_KEY, async () => {
      const company = await seedCompany(
        "Draft Co",
        `draft-ok-${Date.now()}@example.com`,
      );
      const plainName = "Иван Тестов";
      const plainAddress = "ул. Тестовая, 1";
      const key = `idem-${Date.now()}-a`;

      const result = await createDraftOrder(
        prisma,
        draftInput(company.id, key, {
          recipientName: plainName,
          destAddress: plainAddress,
        }),
      );

      assert.equal(result.created, true);
      assert.equal(result.shipment.status, "DRAFT");
      assert.equal(result.shipment.idempotencyKey, key);
      assert.equal(result.shipment.destCity, "Москва");
      assert.notEqual(result.shipment.recipientName, plainName);
      assert.notEqual(result.shipment.recipientPhone, "+79001234567");
      assert.ok(result.shipment.destAddress);
      assert.notEqual(result.shipment.destAddress, plainAddress);
      assert.equal(result.shipment.legalBasisConfirmed, true);
      assert.equal(result.shipment.carrierId, null);
      assert.equal(result.shipment.serviceCode, null);
      assert.equal(result.shipment.apishipOrderId, null);
    });
  });

  test("(ii) same (companyId, idempotencyKey) twice → created:false, single row", async () => {
    await withEnv(PII_ENV, TEST_PII_KEY, async () => {
      const company = await seedCompany(
        "Dedup Co",
        `draft-dedup-${Date.now()}@example.com`,
      );
      const key = `idem-${Date.now()}-dedup`;

      const first = await createDraftOrder(prisma, draftInput(company.id, key));
      const second = await createDraftOrder(prisma, draftInput(company.id, key));

      assert.equal(first.created, true);
      assert.equal(second.created, false);
      assert.equal(second.shipment.id, first.shipment.id);

      const count = await prisma.shipment.count({
        where: { companyId: company.id, idempotencyKey: key },
      });
      assert.equal(count, 1);
    });
  });

  test("(iii) legalBasisConfirmed false → throws, no row", async () => {
    await withEnv(PII_ENV, TEST_PII_KEY, async () => {
      const company = await seedCompany(
        "Legal Co",
        `draft-legal-${Date.now()}@example.com`,
      );
      const key = `idem-${Date.now()}-legal`;

      await assert.rejects(
        () =>
          createDraftOrder(
            prisma,
            draftInput(company.id, key, { legalBasisConfirmed: false }),
          ),
        (error) =>
          error instanceof Error &&
          error.message.includes("Подтвердите правовое основание"),
      );

      const count = await prisma.shipment.count({
        where: { companyId: company.id },
      });
      assert.equal(count, 0);
    });
  });

  test("(iv) two different idempotencyKeys → two distinct rows", async () => {
    await withEnv(PII_ENV, TEST_PII_KEY, async () => {
      const company = await seedCompany(
        "Two Keys Co",
        `draft-two-${Date.now()}@example.com`,
      );
      const keyA = `idem-${Date.now()}-a`;
      const keyB = `idem-${Date.now()}-b`;

      const a = await createDraftOrder(prisma, draftInput(company.id, keyA));
      const b = await createDraftOrder(prisma, draftInput(company.id, keyB));

      assert.equal(a.created, true);
      assert.equal(b.created, true);
      assert.notEqual(a.shipment.id, b.shipment.id);

      const count = await prisma.shipment.count({
        where: { companyId: company.id },
      });
      assert.equal(count, 2);
    });
  });

  test("(v) existing row past DRAFT (SUBMITTING) → created:false returns that row", async () => {
    await withEnv(PII_ENV, TEST_PII_KEY, async () => {
      const company = await seedCompany(
        "Past Draft Co",
        `draft-past-${Date.now()}@example.com`,
      );
      const key = `idem-${Date.now()}-past`;

      const first = await createDraftOrder(prisma, draftInput(company.id, key));
      assert.equal(first.created, true);

      await prisma.shipment.update({
        where: { id: first.shipment.id },
        data: { status: "SUBMITTING", submittingAt: new Date() },
      });

      const second = await createDraftOrder(prisma, draftInput(company.id, key));
      assert.equal(second.created, false);
      assert.equal(second.shipment.id, first.shipment.id);
      assert.equal(second.shipment.status, "SUBMITTING");
    });
  });
});
