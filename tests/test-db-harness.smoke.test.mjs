import assert from "node:assert/strict";
import test from "node:test";

import {
  assertTestDatabaseUrl,
  getTestPrisma,
  truncateAll,
} from "./helpers/test-db.mjs";

test("assertTestDatabaseUrl rejects a non-_test (dev) database name", () => {
  assert.throws(
    () =>
      assertTestDatabaseUrl(
        "postgresql://oco:secret@localhost:15432/oco_logistics?schema=public",
      ),
    /Refusing non-test database URL/,
  );
});

test("getTestPrisma can insert, read, and truncate a Shipment on the test DB", async () => {
  const prisma = getTestPrisma();
  try {
    const company = await prisma.company.create({
      data: {
        name: "Harness Smoke Co",
        contactEmail: `harness-smoke-${Date.now()}@example.com`,
      },
    });

    const created = await prisma.shipment.create({
      data: {
        companyId: company.id,
        weightG: 500,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
        destCity: "Москва",
        recipientName: "Smoke Recipient",
        recipientPhone: "+79001234567",
        status: "DRAFT",
      },
    });

    const found = await prisma.shipment.findUnique({ where: { id: created.id } });
    assert.ok(found);
    assert.equal(found.companyId, company.id);
    assert.equal(found.status, "DRAFT");

    await truncateAll(prisma);

    const after = await prisma.shipment.findUnique({ where: { id: created.id } });
    assert.equal(after, null);

    // Company is not in TRUNCATE_TABLES yet — clean up so smoke stays idempotent.
    await prisma.company.delete({ where: { id: company.id } });
  } finally {
    await prisma.$disconnect();
  }
});
