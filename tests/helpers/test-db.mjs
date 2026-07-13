/**
 * Isolated Postgres test-DB helpers.
 *
 * Prerequisites: run `npm run db:test:setup` once (creates + migrates
 * `oco_logistics_test`). If the test DB or tables are missing, Prisma calls
 * fail with a connection/relation error — re-run setup.
 *
 * Do NOT import `@oco/db`'s singleton here: it binds to process.env.DATABASE_URL
 * (dev). Tests always get a separate PrismaClient pointed at the test URL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ENV_PATH = path.join(REPO_ROOT, ".env");

/** Tables cleared between tests. Extend as more models are exercised.
 * Shipment FK→Company: one TRUNCATE … CASCADE covers both. */
const TRUNCATE_TABLES = ["Shipment", "Company"];

const TEST_DATABASE_NAME = "oco_logistics_test";

function stripWrappingQuotes(value) {
  const v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

function readEnvFileValue(filePath, key) {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const name = trimmed.slice(0, eq).trim();
    if (name !== key) {
      continue;
    }
    return stripWrappingQuotes(trimmed.slice(eq + 1));
  }
  return undefined;
}

/** Database name from a postgres URL pathname (`/oco_logistics` → `oco_logistics`). */
export function databaseNameFromUrl(databaseUrl) {
  const u = new URL(databaseUrl);
  const name = u.pathname.replace(/^\//, "").split("/")[0] ?? "";
  return name;
}

/**
 * Hard safety guard: refuse any URL whose database name is not exactly
 * `oco_logistics_test` (must end in `_test`). Prevents seeding/deleting
 * against the dev database.
 */
export function assertTestDatabaseUrl(databaseUrl) {
  const name = databaseNameFromUrl(databaseUrl);
  if (name !== TEST_DATABASE_NAME || !name.endsWith("_test")) {
    throw new Error(
      `Refusing non-test database URL (db="${name}"). ` +
        `Expected exactly "${TEST_DATABASE_NAME}".`,
    );
  }
}

/**
 * Swap ONLY the database name to `oco_logistics_test` via the URL API
 * (preserves user/password/host/port/query). Then apply the hard guard.
 */
export function deriveTestDatabaseUrl(devDatabaseUrl) {
  const u = new URL(devDatabaseUrl);
  u.pathname = `/${TEST_DATABASE_NAME}`;
  const testUrl = u.toString();
  assertTestDatabaseUrl(testUrl);
  return testUrl;
}

/** Same URL as deriveTestDatabaseUrl but pathname `/postgres` for CREATE DATABASE. */
export function deriveAdminDatabaseUrl(devDatabaseUrl) {
  const u = new URL(devDatabaseUrl);
  u.pathname = "/postgres";
  return u.toString();
}

/**
 * Dev DATABASE_URL from process.env or repo-root `.env`.
 * Does not mutate process.env.
 */
export function readDevDatabaseUrl() {
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) {
    return stripWrappingQuotes(fromEnv);
  }
  const fromFile = readEnvFileValue(ENV_PATH, "DATABASE_URL");
  if (!fromFile) {
    throw new Error(
      `DATABASE_URL not set and not found in ${ENV_PATH}. ` +
        `Copy infra/.env.example to .env or export DATABASE_URL.`,
    );
  }
  return fromFile;
}

export function resolveTestDatabaseUrl() {
  return deriveTestDatabaseUrl(readDevDatabaseUrl());
}

/**
 * Fresh PrismaClient bound to `oco_logistics_test` via datasources override.
 * Never reuses `@oco/db` singleton.
 */
export function getTestPrisma() {
  const url = resolveTestDatabaseUrl();
  return new PrismaClient({
    datasources: { db: { url } },
    log: ["error"],
  });
}

/**
 * Truncate test tables for a clean slate. Uses RESTART IDENTITY CASCADE.
 * Extend TRUNCATE_TABLES as needed.
 */
export async function truncateAll(prisma) {
  if (TRUNCATE_TABLES.length === 0) {
    return;
  }
  const list = TRUNCATE_TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}

export { TEST_DATABASE_NAME, REPO_ROOT, TRUNCATE_TABLES };
