import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, test } from "node:test";

import { decryptCarrierCredentials } from "../../apps/web/lib/carrier-credentials.ts";
import {
  CARRIER_CREDENTIAL_FIELDS,
  connectCarrierCredentials,
} from "../../apps/web/lib/carriers/connect-carrier-credentials.ts";
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

  /**
   * INVARIANT the «Подключение» tab relies on: isConnected ⇒ every field of the
   * carrier's spec is present in the stored bag. The UI marks every field
   * «сохранён» from isConnected alone and never decrypts.
   *
   * Rows inserted by hand-written SQL (or any path other than
   * connectCarrierCredentials) bypass this — that is how every existing row was
   * made. This test only pins what the service writes.
   */
  test("a bag stored by connectCarrierCredentials always contains every field of that carrier's spec", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const bags = {
        yataxi: {
          platformStationId: "station-complete",
          token: "yandex-token-complete",
        },
        cdek: {
          account: "acct-complete",
          securePassword: "cdek-secret-complete",
          contractType: "1",
        },
      };

      for (const [providerKey, credentials] of Object.entries(bags)) {
        const company = await seedCompany(
          `Complete ${providerKey}`,
          `connect-complete-${providerKey}-${Date.now()}@example.com`,
        );
        const result = await connectCarrierCredentials(
          prisma,
          { companyId: company.id, providerKey, credentials },
          accepted,
        );
        assert.deepEqual(result, { status: "stored" }, providerKey);

        const row = await prisma.carrierCredential.findFirstOrThrow({
          where: { companyId: company.id, providerKey },
        });
        const stored = decryptCarrierCredentials(row.credentialsEnc);
        const spec = CARRIER_CREDENTIAL_FIELDS[providerKey];
        assert.ok(spec, `spec for ${providerKey}`);

        for (const field of spec) {
          const value = stored[field.name];
          assert.equal(
            typeof value,
            "string",
            `${providerKey}.${field.name} must be present as a string`,
          );
          assert.ok(
            value.trim() !== "",
            `${providerKey}.${field.name} must be non-blank`,
          );
        }
      }
    });
  });

  /**
   * The merge, against real storage. A connected seller retypes ONE field and
   * leaves the rest empty; the untouched fields must survive.
   */
  test("connected, one field resubmitted, carrier accepts → row holds the merged bag", async () => {
    await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
      const company = await seedCompany(
        "Merge Co",
        `connect-merge-${Date.now()}@example.com`,
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

      // Only the token is retyped; platformStationId is left empty.
      const result = await connectCarrierCredentials(
        prisma,
        {
          companyId: company.id,
          providerKey: PROVIDER_YANDEX,
          credentials: { token: "yandex-token-retyped" },
        },
        accepted,
      );
      assert.deepEqual(result, { status: "stored" });

      const rows = await prisma.carrierCredential.findMany({
        where: { companyId: company.id },
      });
      assert.equal(rows.length, 1);
      assert.deepEqual(decryptCarrierCredentials(rows[0].credentialsEnc), {
        // Untouched, carried over from the stored bag…
        platformStationId: BAG.platformStationId,
        // …and the one field the seller actually retyped.
        token: "yandex-token-retyped",
      });
    });
  });

  /**
   * THE PROPERTY THAT MATTERS MOST: a mistyped token must not cost a seller a
   * working connection. Compared on the raw ciphertext — encryption uses a fresh
   * IV each time, so an identical string proves no write happened at all.
   */
  for (const [label, deps, expected] of [
    ["rejects", rejected, { status: "rejected_by_carrier", reason: "invalid_auth" }],
    ["is unavailable", unavailable, { status: "carrier_unavailable" }],
  ]) {
    test(`connected, one field resubmitted, carrier ${label} → the stored row is untouched`, async () => {
      await withEnv(ENV_KEY, TEST_ENCRYPTION_KEY, async () => {
        const company = await seedCompany(
          `Keep ${label}`,
          `connect-keep-${label.replace(/\s/g, "-")}-${Date.now()}@example.com`,
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
        const before = await prisma.carrierCredential.findFirstOrThrow({
          where: { companyId: company.id, providerKey: PROVIDER_YANDEX },
        });

        const result = await connectCarrierCredentials(
          prisma,
          {
            companyId: company.id,
            providerKey: PROVIDER_YANDEX,
            credentials: { token: "mistyped-token" },
          },
          deps,
        );
        assert.deepEqual(result, expected);

        const after = await prisma.carrierCredential.findFirstOrThrow({
          where: { companyId: company.id, providerKey: PROVIDER_YANDEX },
        });
        assert.equal(after.id, before.id);
        assert.equal(
          after.credentialsEnc,
          before.credentialsEnc,
          "the ciphertext must be byte-identical — nothing was written",
        );
        assert.equal(
          after.updatedAt.getTime(),
          before.updatedAt.getTime(),
          "updatedAt must not move when nothing was stored",
        );
        // The working connection still decrypts to what it was.
        assert.deepEqual(decryptCarrierCredentials(after.credentialsEnc), BAG);
      });
    });
  }

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
