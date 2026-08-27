import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { getTestPrisma, truncateAll } from "../helpers/test-db.mjs";

/** @type {import("@prisma/client").PrismaClient} */
let prisma;

async function seedCompany(name, email) {
  return prisma.company.create({
    data: { name, contactEmail: email },
  });
}

describe("Company.defaultOfferPriority", () => {
  beforeEach(async () => {
    prisma = getTestPrisma();
    await truncateAll(prisma);
  });

  afterEach(async () => {
    await truncateAll(prisma);
  });

  test("a new company has NULL — «the seller has not chosen», not a default we picked", async () => {
    const company = await seedCompany("Без выбора", "none@example.com");
    const read = await prisma.company.findUnique({
      where: { id: company.id },
      select: { defaultOfferPriority: true },
    });
    assert.equal(read.defaultOfferPriority, null);
  });

  test("both values round-trip", async () => {
    for (const value of ["CHEAPEST", "FASTEST"]) {
      const company = await seedCompany(`Компания ${value}`, `${value}@example.com`);
      await prisma.company.update({
        where: { id: company.id },
        data: { defaultOfferPriority: value },
      });
      const read = await prisma.company.findUnique({
        where: { id: company.id },
        select: { defaultOfferPriority: true },
      });
      assert.equal(read.defaultOfferPriority, value);
    }
  });

  test("a chosen priority can be cleared back to NULL", async () => {
    // «Ничего не подставлять» is the absence of a preference, so it must be
    // reachable AFTER choosing — otherwise the setting would be a one-way door.
    const company = await seedCompany("Передумали", "clear@example.com");
    await prisma.company.update({
      where: { id: company.id },
      data: { defaultOfferPriority: "FASTEST" },
    });
    await prisma.company.update({
      where: { id: company.id },
      data: { defaultOfferPriority: null },
    });
    const read = await prisma.company.findUnique({
      where: { id: company.id },
      select: { defaultOfferPriority: true },
    });
    assert.equal(read.defaultOfferPriority, null);
  });

  test("the database refuses a value outside the enum", async () => {
    // The parser rejects the old vocabulary before it gets here; this asserts
    // the column is a second line of defence rather than a bare string.
    const company = await seedCompany("Старый словарь", "old@example.com");
    await assert.rejects(
      prisma.company.update({
        where: { id: company.id },
        data: { defaultOfferPriority: /** @type {any} */ ("OPTIMAL") },
      }),
    );
  });
});
