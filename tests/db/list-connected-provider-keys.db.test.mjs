import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { listConnectedProviderKeys } from "../../apps/web/lib/shipments/list-connected-carriers.ts";
import { getTestPrisma, truncateAll } from "../helpers/test-db.mjs";

/** @type {import("@prisma/client").PrismaClient} */
let prisma;

/**
 * @param {string} companyName
 * @param {string} email
 */
async function seedCompany(companyName, email) {
  return prisma.company.create({
    data: { name: companyName, contactEmail: email },
  });
}

beforeEach(async () => {
  prisma = getTestPrisma();
  await truncateAll(prisma);
});

afterEach(async () => {
  await truncateAll(prisma);
  await prisma.$disconnect();
});

// Real Postgres + shared truncate: must run serially.
describe("listConnectedProviderKeys", { concurrency: false }, () => {
  test("one row → that providerKey", async () => {
    const company = await seedCompany(
      "Provider Keys One Co",
      `provider-keys-one-${Date.now()}@example.com`,
    );
    await prisma.carrierCredential.create({
      data: {
        companyId: company.id,
        providerKey: "yataxi",
        // Ciphertext is opaque here — helper must not decrypt.
        credentialsEnc: "opaque-ciphertext-not-decrypted",
      },
    });

    const result = await listConnectedProviderKeys(prisma, company.id);
    assert.deepEqual(result, ["yataxi"]);
  });

  test("no rows → []", async () => {
    const company = await seedCompany(
      "Provider Keys Empty Co",
      `provider-keys-empty-${Date.now()}@example.com`,
    );

    const result = await listConnectedProviderKeys(prisma, company.id);
    assert.deepEqual(result, []);
  });
});
