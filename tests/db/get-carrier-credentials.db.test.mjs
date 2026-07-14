import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, test } from "node:test";

import { encryptCarrierCredentials } from "../../apps/web/lib/carrier-credentials.ts";
import { getCarrierCredentials } from "../../apps/web/lib/shipments/get-carrier-credentials.ts";
import { getTestPrisma, truncateAll } from "../helpers/test-db.mjs";

const ENV_KEY = "CARRIER_CREDENTIALS_ENCRYPTION_KEY";
/** Self-contained test key — never read real .env secrets. */
const TEST_ENCRYPTION_KEY = `test-carrier-creds-${randomBytes(24).toString("hex")}`;
assert.ok(TEST_ENCRYPTION_KEY.length >= 32, "test encryption key must be >= 32 chars");

const PROVIDER_YANDEX = "yataxi";

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
describe("getCarrierCredentials", { concurrency: false }, () => {
  test("(i) row present with valid encrypted bag → ok + round-trip credentials", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const company = await seedCompany(
        "Creds Co",
        `creds-ok-${Date.now()}@example.com`,
      );
      const bag = {
        platformStationId: "station-abc",
        token: "yandex-token-xyz",
      };
      const credentialsEnc = encryptCarrierCredentials(bag);
      await prisma.carrierCredential.create({
        data: {
          companyId: company.id,
          providerKey: PROVIDER_YANDEX,
          credentialsEnc,
        },
      });

      const result = await getCarrierCredentials(
        prisma,
        company.id,
        PROVIDER_YANDEX,
      );
      assert.deepEqual(result, { ok: true, credentials: bag });
    });
  });

  test("(ii) no row for (companyId, providerKey) → not_connected (no throw)", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const company = await seedCompany(
        "No Creds Co",
        `creds-missing-${Date.now()}@example.com`,
      );

      const result = await getCarrierCredentials(
        prisma,
        company.id,
        PROVIDER_YANDEX,
      );
      assert.deepEqual(result, { ok: false, reason: "not_connected" });
    });
  });

  test("(iii) row for different companyId is not returned (scoping)", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const owner = await seedCompany(
        "Owner Creds Co",
        `creds-owner-${Date.now()}@example.com`,
      );
      const other = await seedCompany(
        "Other Creds Co",
        `creds-other-${Date.now()}@example.com`,
      );
      await prisma.carrierCredential.create({
        data: {
          companyId: owner.id,
          providerKey: PROVIDER_YANDEX,
          credentialsEnc: encryptCarrierCredentials({
            platformStationId: "owner-station",
            token: "owner-token",
          }),
        },
      });

      const result = await getCarrierCredentials(
        prisma,
        other.id,
        PROVIDER_YANDEX,
      );
      assert.deepEqual(result, { ok: false, reason: "not_connected" });
    });
  });

  test("(iv) bad ciphertext → THROWS (not not_connected)", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const company = await seedCompany(
        "Bad Cipher Co",
        `creds-bad-cipher-${Date.now()}@example.com`,
      );
      await prisma.carrierCredential.create({
        data: {
          companyId: company.id,
          providerKey: PROVIDER_YANDEX,
          credentialsEnc: "not-valid-ciphertext",
        },
      });

      await assert.rejects(
        () => getCarrierCredentials(prisma, company.id, PROVIDER_YANDEX),
        (error) =>
          error instanceof Error &&
          error.message.includes(
            "Некорректный формат зашифрованных credentials перевозчика",
          ),
      );
    });
  });

  test("(v) missing encryption key → THROWS (not not_connected)", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const company = await seedCompany(
        "Missing Key Co",
        `creds-missing-key-${Date.now()}@example.com`,
      );
      const credentialsEnc = encryptCarrierCredentials({
        platformStationId: "station",
        token: "token",
      });
      await prisma.carrierCredential.create({
        data: {
          companyId: company.id,
          providerKey: PROVIDER_YANDEX,
          credentialsEnc,
        },
      });

      await withEnv(ENV_KEY, undefined, async () => {
        await assert.rejects(
          () => getCarrierCredentials(prisma, company.id, PROVIDER_YANDEX),
          (error) =>
            error instanceof Error &&
            error.message.includes("CARRIER_CREDENTIALS_ENCRYPTION_KEY_MISSING"),
        );
      });
    });
  });
});
