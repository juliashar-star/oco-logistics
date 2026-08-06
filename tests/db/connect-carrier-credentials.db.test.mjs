import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, test } from "node:test";

import { decryptCarrierCredentials } from "../../apps/web/lib/carrier-credentials.ts";
import { connectCarrierCredentials } from "../../apps/web/lib/carriers/connect-carrier-credentials.ts";
import { getTestPrisma, truncateAll } from "../helpers/test-db.mjs";

const ENV_KEY = "CARRIER_CREDENTIALS_ENCRYPTION_KEY";
/** Self-contained test key — never read real .env secrets. */
const TEST_ENCRYPTION_KEY = `test-connect-creds-${randomBytes(24).toString("hex")}`;
assert.ok(TEST_ENCRYPTION_KEY.length >= 32, "test encryption key must be >= 32 chars");

const PROVIDER_YANDEX = "yataxi";

const BAG = { platformStationId: "station-1", token: "yandex-token-first" };
const NEW_BAG = { platformStationId: "station-2", token: "yandex-token-second" };

/** Verdict-only stubs: persistence is what these tests measure, not the network. */
const accepted = { getVerifier: () => async () => ({ status: "accepted" }) };
const rejected = {
  getVerifier: () => async () => ({
    status: "rejected",
    reason: "invalid_auth",
  }),
};
const unavailable = {
  getVerifier: () => async () => ({ status: "unavailable" }),
};

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
describe("connectCarrierCredentials persistence", { concurrency: false }, () => {
  test("accepted → exactly one row, and the stored bag decrypts back to the input", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const company = await seedCompany(
        "Connect Co",
        `connect-ok-${Date.now()}@example.com`,
      );

      const result = await connectCarrierCredentials(
        prisma,
        {
          companyId: company.id,
          providerKey: PROVIDER_YANDEX,
          credentials: BAG,
        },
        accepted,
      );
      assert.deepEqual(result, { status: "stored" });

      const rows = await prisma.carrierCredential.findMany({
        where: { companyId: company.id },
      });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].providerKey, PROVIDER_YANDEX);
      // Stored ciphertext, not plaintext.
      assert.ok(!rows[0].credentialsEnc.includes(BAG.token));
      assert.deepEqual(decryptCarrierCredentials(rows[0].credentialsEnc), BAG);
    });
  });

  test("rejected → NO row is written", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const company = await seedCompany(
        "Rejected Co",
        `connect-rejected-${Date.now()}@example.com`,
      );

      const result = await connectCarrierCredentials(
        prisma,
        {
          companyId: company.id,
          providerKey: PROVIDER_YANDEX,
          credentials: BAG,
        },
        rejected,
      );
      assert.deepEqual(result, {
        status: "rejected_by_carrier",
        reason: "invalid_auth",
      });

      assert.equal(
        await prisma.carrierCredential.count({ where: { companyId: company.id } }),
        0,
      );
    });
  });

  test("unavailable → NO row is written (a carrier being down is not a connection)", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const company = await seedCompany(
        "Unavailable Co",
        `connect-unavailable-${Date.now()}@example.com`,
      );

      const result = await connectCarrierCredentials(
        prisma,
        {
          companyId: company.id,
          providerKey: PROVIDER_YANDEX,
          credentials: BAG,
        },
        unavailable,
      );
      assert.deepEqual(result, { status: "carrier_unavailable" });

      assert.equal(
        await prisma.carrierCredential.count({ where: { companyId: company.id } }),
        0,
      );
    });
  });

  test("reconnect with a new bag → still one row, new content, connectedAt unchanged", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const company = await seedCompany(
        "Reconnect Co",
        `connect-again-${Date.now()}@example.com`,
      );

      await connectCarrierCredentials(
        prisma,
        {
          companyId: company.id,
          providerKey: PROVIDER_YANDEX,
          credentials: BAG,
        },
        accepted,
      );
      const first = await prisma.carrierCredential.findFirstOrThrow({
        where: { companyId: company.id, providerKey: PROVIDER_YANDEX },
      });

      const result = await connectCarrierCredentials(
        prisma,
        {
          companyId: company.id,
          providerKey: PROVIDER_YANDEX,
          credentials: NEW_BAG,
        },
        accepted,
      );
      assert.deepEqual(result, { status: "stored" });

      const rows = await prisma.carrierCredential.findMany({
        where: { companyId: company.id },
      });
      assert.equal(rows.length, 1, "reconnect must replace, not add a second row");

      const second = rows[0];
      assert.equal(second.id, first.id, "same row, updated in place");
      // Replaced, not merged: the old bag is gone.
      assert.deepEqual(decryptCarrierCredentials(second.credentialsEnc), NEW_BAG);
      assert.notEqual(second.credentialsEnc, first.credentialsEnc);

      // The point of the slice: first-connection time survives a re-entry.
      assert.equal(
        second.connectedAt.getTime(),
        first.connectedAt.getTime(),
        "connectedAt must not be reset on reconnect",
      );
      assert.ok(
        second.updatedAt.getTime() >= first.updatedAt.getTime(),
        "updatedAt must move (or hold) on update",
      );
    });
  });
});
