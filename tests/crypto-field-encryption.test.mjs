import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

/** Self-contained test keys — never read real .env secrets. */
const RECIPIENT_TEST_KEY = `test-recipient-${randomBytes(24).toString("hex")}`;
const APISHIP_TEST_KEY = `test-apiship-${randomBytes(24).toString("hex")}`;

assert.ok(RECIPIENT_TEST_KEY.length >= 32, "recipient test key must be >= 32 chars");
assert.ok(APISHIP_TEST_KEY.length >= 32, "apiship test key must be >= 32 chars");

async function importRecipientCrypto() {
  return import("../apps/web/lib/recipient-pii-credentials.ts");
}

async function importApishipCrypto() {
  return import("../apps/web/lib/apiship-credentials.ts");
}

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

function runCryptoSuite(suiteName, envName, testKey, importCrypto) {
  test(`${suiteName} — round trip returns original string`, async () => {
    await withEnv(envName, testKey, async () => {
      const { encrypt, decrypt } = await importCrypto();
      const plain = "тестовое значение";
      const encrypted = encrypt(plain);
      assert.equal(decrypt(encrypted), plain);
    });
  });

  test(`${suiteName} — round trip preserves Cyrillic and special characters`, async () => {
    await withEnv(envName, testKey, async () => {
      const { encrypt, decrypt } = await importCrypto();
      const plain = "Иванов И.И., кв. 5, д. 10/2";
      const encrypted = encrypt(plain);
      assert.equal(decrypt(encrypted), plain);
    });
  });

  test(`${suiteName} — encrypt uses random IV (same input → different ciphertext)`, async () => {
    await withEnv(envName, testKey, async () => {
      const { encrypt } = await importCrypto();
      const plain = "тестовое значение";
      const first = encrypt(plain);
      const second = encrypt(plain);
      assert.notEqual(first, second);
    });
  });

  test(`${suiteName} — decrypt throws when encryption key is unset`, async () => {
    await withEnv(envName, testKey, async () => {
      const { encrypt, decrypt } = await importCrypto();
      const encrypted = encrypt("тестовое значение");

      await withEnv(envName, undefined, async () => {
        assert.throws(
          () => decrypt(encrypted),
          (error) => error instanceof Error && error.message.includes("_MISSING"),
        );
      });
    });
  });

  test(`${suiteName} — decrypt throws when encryption key is shorter than 32 chars`, async () => {
    await withEnv(envName, testKey, async () => {
      const { encrypt, decrypt } = await importCrypto();
      const encrypted = encrypt("тестовое значение");

      await withEnv(envName, "short-key", async () => {
        assert.throws(
          () => decrypt(encrypted),
          (error) => error instanceof Error && error.message.includes("_MISSING"),
        );
      });
    });
  });

  test(`${suiteName} — decrypt throws on malformed payload`, async () => {
    await withEnv(envName, testKey, async () => {
      const { decrypt } = await importCrypto();

      assert.throws(
        () => decrypt("not-valid"),
        (error) => error instanceof Error && error.message.length > 0,
      );
      assert.throws(
        () => decrypt("part1.part2"),
        (error) => error instanceof Error && error.message.length > 0,
      );
    });
  });
}

runCryptoSuite(
  "encryptRecipientPii / decryptRecipientPii",
  "RECIPIENT_PII_ENCRYPTION_KEY",
  RECIPIENT_TEST_KEY,
  async () => {
    const mod = await importRecipientCrypto();
    return {
      encrypt: mod.encryptRecipientPii,
      decrypt: mod.decryptRecipientPii,
    };
  },
);

runCryptoSuite(
  "encryptApishipPassword / decryptApishipPassword",
  "APISHIP_ENCRYPTION_KEY",
  APISHIP_TEST_KEY,
  async () => {
    const mod = await importApishipCrypto();
    return {
      encrypt: mod.encryptApishipPassword,
      decrypt: mod.decryptApishipPassword,
    };
  },
);
