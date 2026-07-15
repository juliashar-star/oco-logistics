import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, test } from "node:test";

import { encryptCarrierCredentials } from "../../apps/web/lib/carrier-credentials.ts";
import { listConnectedCarriers } from "../../apps/web/lib/shipments/list-connected-carriers.ts";
import { getTestPrisma, truncateAll } from "../helpers/test-db.mjs";

const ENV_KEY = "CARRIER_CREDENTIALS_ENCRYPTION_KEY";
/** Self-contained test key — never read real .env secrets. */
const TEST_ENCRYPTION_KEY = `test-list-creds-${randomBytes(24).toString("hex")}`;
assert.ok(TEST_ENCRYPTION_KEY.length >= 32, "test encryption key must be >= 32 chars");

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

beforeEach(async () => {
  prisma = getTestPrisma();
  await truncateAll(prisma);
});

afterEach(async () => {
  await truncateAll(prisma);
  await prisma.$disconnect();
});

// Real Postgres + shared truncate: must run serially.
describe("listConnectedCarriers", { concurrency: false }, () => {
  test("two connected providers round-trip decrypted", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const company = await seedCompany(
        "List Creds Co",
        `list-ok-${Date.now()}@example.com`,
      );
      const yandexBag = {
        platformStationId: "station-abc",
        token: "yandex-token-xyz",
      };
      const cdekBag = {
        account: "cdek-account",
        securePassword: "cdek-secret",
      };
      await prisma.carrierCredential.createMany({
        data: [
          {
            companyId: company.id,
            providerKey: "yataxi",
            credentialsEnc: encryptCarrierCredentials(yandexBag),
          },
          {
            companyId: company.id,
            providerKey: "cdek",
            credentialsEnc: encryptCarrierCredentials(cdekBag),
          },
        ],
      });

      const result = await listConnectedCarriers(prisma, company.id);
      assert.equal(result.length, 2);
      const byKey = Object.fromEntries(
        result.map((row) => [row.providerKey, row.credentials]),
      );
      assert.deepEqual(byKey.yataxi, yandexBag);
      assert.deepEqual(byKey.cdek, cdekBag);
    });
  });

  test("ordering is by providerKey ascending", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const company = await seedCompany(
        "List Order Co",
        `list-order-${Date.now()}@example.com`,
      );
      // Insert out of alpha order so findMany without orderBy could scramble.
      await prisma.carrierCredential.createMany({
        data: [
          {
            companyId: company.id,
            providerKey: "yataxi",
            credentialsEnc: encryptCarrierCredentials({ token: "y" }),
          },
          {
            companyId: company.id,
            providerKey: "cdek",
            credentialsEnc: encryptCarrierCredentials({ token: "c" }),
          },
          {
            companyId: company.id,
            providerKey: "dpd",
            credentialsEnc: encryptCarrierCredentials({ token: "d" }),
          },
        ],
      });

      const result = await listConnectedCarriers(prisma, company.id);
      assert.deepEqual(
        result.map((row) => row.providerKey),
        ["cdek", "dpd", "yataxi"],
      );
    });
  });

  test("another company's rows are never returned (company scoping)", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const owner = await seedCompany(
        "List Owner Co",
        `list-owner-${Date.now()}@example.com`,
      );
      const other = await seedCompany(
        "List Other Co",
        `list-other-${Date.now()}@example.com`,
      );
      await prisma.carrierCredential.create({
        data: {
          companyId: owner.id,
          providerKey: "yataxi",
          credentialsEnc: encryptCarrierCredentials({
            platformStationId: "owner-station",
            token: "owner-token",
          }),
        },
      });
      await prisma.carrierCredential.create({
        data: {
          companyId: other.id,
          providerKey: "cdek",
          credentialsEnc: encryptCarrierCredentials({
            account: "other-cdek",
            securePassword: "other-secret",
          }),
        },
      });

      const result = await listConnectedCarriers(prisma, other.id);
      assert.equal(result.length, 1);
      assert.equal(result[0].providerKey, "cdek");
      assert.deepEqual(result[0].credentials, {
        account: "other-cdek",
        securePassword: "other-secret",
      });
    });
  });

  test("no rows → []", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const company = await seedCompany(
        "List Empty Co",
        `list-empty-${Date.now()}@example.com`,
      );

      const result = await listConnectedCarriers(prisma, company.id);
      assert.deepEqual(result, []);
    });
  });

  test("corrupt ciphertext → THROWS (not swallowed per row)", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const company = await seedCompany(
        "List Bad Cipher Co",
        `list-bad-cipher-${Date.now()}@example.com`,
      );
      await prisma.carrierCredential.create({
        data: {
          companyId: company.id,
          providerKey: "yataxi",
          credentialsEnc: "not-valid-ciphertext",
        },
      });

      await assert.rejects(
        () => listConnectedCarriers(prisma, company.id),
        (error) =>
          error instanceof Error &&
          error.message.includes(
            "Некорректный формат зашифрованных credentials перевозчика",
          ),
      );
    });
  });
});
