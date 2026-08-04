import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, test } from "node:test";

import { createDraftOrder } from "../../apps/web/lib/shipments/create-draft-order.ts";
import { decryptShipmentRecipientPii } from "../../apps/web/lib/recipient-pii.ts";
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
 * @param {Partial<{ legalBasisConfirmed: boolean; recipientName: string; destAddress?: string; destApartment?: string; deliveryComment?: string }>} [overrides]
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
    destApartment: overrides.destApartment,
    deliveryComment: overrides.deliveryComment,
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

  test("(i-b) courier with destApartment + deliveryComment → encrypted at rest + decrypt round-trip", async () => {
    await withEnv(PII_ENV, TEST_PII_KEY, async () => {
      const company = await seedCompany(
        "Apt Co",
        `draft-apt-${Date.now()}@example.com`,
      );
      const plainApartment = "42";
      const plainComment = "Домофон 42#, код 1234";
      const key = `idem-${Date.now()}-apt`;

      const result = await createDraftOrder(
        prisma,
        draftInput(company.id, key, {
          destApartment: plainApartment,
          deliveryComment: plainComment,
        }),
      );

      assert.equal(result.created, true);
      assert.ok(result.shipment.destApartment);
      assert.ok(result.shipment.deliveryComment);
      assert.notEqual(result.shipment.destApartment, plainApartment);
      assert.notEqual(result.shipment.deliveryComment, plainComment);

      const decrypted = decryptShipmentRecipientPii({
        recipientName: result.shipment.recipientName,
        recipientPhone: result.shipment.recipientPhone,
        destAddress: result.shipment.destAddress,
        destApartment: result.shipment.destApartment,
        deliveryComment: result.shipment.deliveryComment,
        isAnonymized: result.shipment.isAnonymized,
      });
      assert.equal(decrypted.destApartment, plainApartment);
      assert.equal(decrypted.deliveryComment, plainComment);
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

  test("(v) existing row past DRAFT (SUBMITTING) → conflict, row untouched", async () => {
    await withEnv(PII_ENV, TEST_PII_KEY, async () => {
      const company = await seedCompany(
        "Past Draft Co",
        `draft-past-${Date.now()}@example.com`,
      );
      const key = `idem-${Date.now()}-past`;

      const first = await createDraftOrder(prisma, draftInput(company.id, key));
      assert.equal(first.created, true);
      const originalWeight = first.shipment.weightG;

      await prisma.shipment.update({
        where: { id: first.shipment.id },
        data: { status: "SUBMITTING", submittingAt: new Date() },
      });

      const second = await createDraftOrder(
        prisma,
        draftInput(company.id, key, { recipientName: "Другой Получатель" }),
      );
      assert.equal("conflict" in second && second.conflict, true);
      if (!("conflict" in second) || !second.conflict) {
        assert.fail("expected conflict result");
      }
      assert.equal(second.reason, "not_draft");
      assert.equal(second.shipment.id, first.shipment.id);
      assert.equal(second.shipment.status, "SUBMITTING");

      const row = await prisma.shipment.findUniqueOrThrow({
        where: { id: first.shipment.id },
      });
      assert.equal(row.status, "SUBMITTING");
      assert.equal(row.weightG, originalWeight);
      assert.notEqual(row.recipientName, "Другой Получатель");
    });
  });

  test("(vi) same key with changed parcel fields → same row id, fields updated, quotedOffers wiped", async () => {
    await withEnv(PII_ENV, TEST_PII_KEY, async () => {
      const company = await seedCompany(
        "Update Draft Co",
        `draft-upd-${Date.now()}@example.com`,
      );
      const key = `idem-${Date.now()}-upd`;

      const first = await createDraftOrder(prisma, draftInput(company.id, key));
      assert.equal(first.created, true);

      const expiresAt = new Date("2026-07-25T12:00:00.000Z");
      await prisma.shipment.update({
        where: { id: first.shipment.id },
        data: {
          quotedOffers: [
            { offerId: "stale-offer", priceRub: 100 },
          ],
          selectedOfferId: "stale-offer",
          selectedOfferExpiresAt: expiresAt,
        },
      });

      const second = await createDraftOrder(prisma, {
        ...draftInput(company.id, key),
        weightG: 999,
        lengthCm: 33,
        widthCm: 22,
        heightCm: 11,
        declaredValueRub: 4500,
        destCity: "Москва",
        destAddress: "ул. Новая, 9",
        recipientName: "Пётр Новый",
        recipientPhone: "+79007654321",
      });

      assert.equal("created" in second && second.created, false);
      assert.equal(!("conflict" in second), true);
      assert.equal(second.shipment.id, first.shipment.id);
      assert.equal(second.shipment.status, "DRAFT");
      assert.equal(second.shipment.weightG, 999);
      assert.equal(second.shipment.lengthCm, 33);
      assert.equal(second.shipment.widthCm, 22);
      assert.equal(second.shipment.heightCm, 11);
      assert.equal(second.shipment.declaredValue, 450000);
      assert.equal(second.shipment.selectedOfferId, null);
      assert.equal(second.shipment.selectedOfferExpiresAt, null);
      assert.equal(second.shipment.quotedOffers, null);

      const decrypted = decryptShipmentRecipientPii({
        recipientName: second.shipment.recipientName,
        recipientPhone: second.shipment.recipientPhone,
        destAddress: second.shipment.destAddress,
        destApartment: second.shipment.destApartment,
        deliveryComment: second.shipment.deliveryComment,
        isAnonymized: second.shipment.isAnonymized,
      });
      assert.equal(decrypted.recipientName, "Пётр Новый");
      assert.equal(decrypted.recipientPhone, "+79007654321");
      assert.equal(decrypted.destAddress, "ул. Новая, 9");

      const count = await prisma.shipment.count({
        where: { companyId: company.id, idempotencyKey: key },
      });
      assert.equal(count, 1);
    });
  });

  test("stores needsThermalBag true on create and update", async () => {
    await withEnv(PII_ENV, TEST_PII_KEY, async () => {
      const company = await seedCompany(
        "Thermal Bag Co",
        `draft-thermal-${Date.now()}@example.com`,
      );
      const key = `idem-${Date.now()}-thermal`;

      const first = await createDraftOrder(prisma, {
        ...draftInput(company.id, key),
        needsThermalBag: true,
      });
      assert.equal(first.created, true);
      assert.equal(first.shipment.needsThermalBag, true);

      const second = await createDraftOrder(prisma, {
        ...draftInput(company.id, key),
        needsThermalBag: false,
      });
      assert.equal("created" in second && second.created, false);
      assert.equal(second.shipment.needsThermalBag, false);
    });
  });

  test("without handoverMode stores DROP_OFF", async () => {
    await withEnv(PII_ENV, TEST_PII_KEY, async () => {
      const company = await seedCompany(
        "Handover Default Co",
        `draft-handover-default-${Date.now()}@example.com`,
      );
      const key = `idem-${Date.now()}-handover-default`;

      const result = await createDraftOrder(prisma, draftInput(company.id, key));
      assert.equal(result.created, true);
      assert.equal(result.shipment.handoverMode, "DROP_OFF");
    });
  });

  test('with handoverMode "COURIER" stores COURIER', async () => {
    await withEnv(PII_ENV, TEST_PII_KEY, async () => {
      const company = await seedCompany(
        "Handover Courier Co",
        `draft-handover-courier-${Date.now()}@example.com`,
      );
      const key = `idem-${Date.now()}-handover-courier`;

      const result = await createDraftOrder(prisma, {
        ...draftInput(company.id, key),
        handoverMode: "COURIER",
      });
      assert.equal(result.created, true);
      assert.equal(result.shipment.handoverMode, "COURIER");
    });
  });

  test("update path changes stored COURIER to DROP_OFF", async () => {
    await withEnv(PII_ENV, TEST_PII_KEY, async () => {
      const company = await seedCompany(
        "Handover Update Co",
        `draft-handover-upd-${Date.now()}@example.com`,
      );
      const key = `idem-${Date.now()}-handover-upd`;

      const first = await createDraftOrder(prisma, {
        ...draftInput(company.id, key),
        handoverMode: "COURIER",
      });
      assert.equal(first.created, true);
      assert.equal(first.shipment.handoverMode, "COURIER");

      const second = await createDraftOrder(prisma, {
        ...draftInput(company.id, key),
        handoverMode: "DROP_OFF",
      });
      assert.equal("created" in second && second.created, false);
      assert.equal(second.shipment.id, first.shipment.id);
      assert.equal(second.shipment.handoverMode, "DROP_OFF");
    });
  });

  test("stores pvzProviderKey alongside pvzCode", async () => {
    await withEnv(PII_ENV, TEST_PII_KEY, async () => {
      const company = await seedCompany(
        "Pvz Provider Co",
        `draft-pvz-prov-${Date.now()}@example.com`,
      );
      const key = `idem-${Date.now()}-pvz-prov`;

      const result = await createDraftOrder(prisma, {
        ...draftInput(company.id, key),
        pickupType: "PVZ",
        destAddress: undefined,
        pvzCode: "station-abc",
        pvzProviderKey: "yataxi",
      });
      assert.equal(result.created, true);
      assert.equal(result.shipment.pvzCode, "station-abc");
      assert.equal(result.shipment.pvzProviderKey, "yataxi");
    });
  });

  test("stores null pvzProviderKey when pvzCode absent even if a key was passed", async () => {
    await withEnv(PII_ENV, TEST_PII_KEY, async () => {
      const company = await seedCompany(
        "Pvz Key Orphan Co",
        `draft-pvz-orphan-${Date.now()}@example.com`,
      );
      const key = `idem-${Date.now()}-pvz-orphan`;

      const result = await createDraftOrder(prisma, {
        ...draftInput(company.id, key),
        pickupType: "COURIER",
        pvzCode: undefined,
        pvzProviderKey: "cdek",
      });
      assert.equal(result.created, true);
      assert.equal(result.shipment.pvzCode, null);
      assert.equal(result.shipment.pvzProviderKey, null);
    });
  });

  test("stores null pvzProviderKey when pvzCode is whitespace-only even if a key was passed", async () => {
    await withEnv(PII_ENV, TEST_PII_KEY, async () => {
      const company = await seedCompany(
        "Pvz Whitespace Co",
        `draft-pvz-ws-${Date.now()}@example.com`,
      );
      const key = `idem-${Date.now()}-pvz-ws`;

      const result = await createDraftOrder(prisma, {
        ...draftInput(company.id, key),
        pickupType: "PVZ",
        destAddress: undefined,
        pvzCode: "   ",
        pvzProviderKey: "yataxi",
      });
      assert.equal(result.created, true);
      assert.equal(result.shipment.pvzCode, null);
      assert.equal(result.shipment.pvzProviderKey, null);
    });
  });

  test("UPDATE path overwrites pvzProviderKey and clears it when the point is removed", async () => {
    await withEnv(PII_ENV, TEST_PII_KEY, async () => {
      const company = await seedCompany(
        "Pvz Provider Upd Co",
        `draft-pvz-upd-${Date.now()}@example.com`,
      );
      const key = `idem-${Date.now()}-pvz-upd`;

      const first = await createDraftOrder(prisma, {
        ...draftInput(company.id, key),
        pickupType: "PVZ",
        destAddress: undefined,
        pvzCode: "station-old",
        pvzProviderKey: "yataxi",
      });
      assert.equal(first.created, true);
      assert.equal(first.shipment.pvzProviderKey, "yataxi");

      const overwritten = await createDraftOrder(prisma, {
        ...draftInput(company.id, key),
        pickupType: "PVZ",
        destAddress: undefined,
        pvzCode: "office-cdek-1",
        pvzProviderKey: "cdek",
      });
      assert.equal("created" in overwritten && overwritten.created, false);
      assert.equal(overwritten.shipment.id, first.shipment.id);
      assert.equal(overwritten.shipment.pvzCode, "office-cdek-1");
      assert.equal(overwritten.shipment.pvzProviderKey, "cdek");

      const cleared = await createDraftOrder(prisma, {
        ...draftInput(company.id, key),
        pickupType: "COURIER",
        destAddress: "ул. Курьерская, 2",
        pvzCode: undefined,
        pvzProviderKey: "cdek",
      });
      assert.equal("created" in cleared && cleared.created, false);
      assert.equal(cleared.shipment.id, first.shipment.id);
      assert.equal(cleared.shipment.pvzCode, null);
      assert.equal(cleared.shipment.pvzProviderKey, null);
    });
  });

  test("(vii) DRAFT with submittingAt set → conflict, row untouched", async () => {
    await withEnv(PII_ENV, TEST_PII_KEY, async () => {
      const company = await seedCompany(
        "SubmittingAt Co",
        `draft-subat-${Date.now()}@example.com`,
      );
      const key = `idem-${Date.now()}-subat`;

      const first = await createDraftOrder(prisma, draftInput(company.id, key));
      assert.equal(first.created, true);

      await prisma.shipment.update({
        where: { id: first.shipment.id },
        data: { submittingAt: new Date() },
      });

      const second = await createDraftOrder(
        prisma,
        draftInput(company.id, key, { recipientName: "Не Должен Записаться" }),
      );
      assert.equal("conflict" in second && second.conflict, true);
      if (!("conflict" in second) || !second.conflict) {
        assert.fail("expected conflict result");
      }
      assert.equal(second.reason, "not_draft");

      const row = await prisma.shipment.findUniqueOrThrow({
        where: { id: first.shipment.id },
      });
      assert.equal(row.status, "DRAFT");
      assert.ok(row.submittingAt);
      const decrypted = decryptShipmentRecipientPii({
        recipientName: row.recipientName,
        recipientPhone: row.recipientPhone,
        destAddress: row.destAddress,
        destApartment: row.destApartment,
        deliveryComment: row.deliveryComment,
        isAnonymized: row.isAnonymized,
      });
      assert.equal(decrypted.recipientName, "Иван Тестов");
    });
  });
});
