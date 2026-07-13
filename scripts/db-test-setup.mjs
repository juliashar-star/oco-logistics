/**
 * Idempotent: create database `oco_logistics_test` (if missing) and
 * `prisma migrate deploy` onto it. Never touches the dev DB `oco_logistics`.
 *
 * Usage: npm run db:test:setup
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  TEST_DATABASE_NAME,
  assertTestDatabaseUrl,
  deriveAdminDatabaseUrl,
  deriveTestDatabaseUrl,
  readDevDatabaseUrl,
} from "../tests/helpers/test-db.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = "packages/db/prisma/schema.prisma";

async function ensureTestDatabaseExists(adminUrl, dbName) {
  const admin = new PrismaClient({
    datasources: { db: { url: adminUrl } },
    log: ["error"],
  });
  try {
    const rows = await admin.$queryRaw`
      SELECT 1 AS ok FROM pg_database WHERE datname = ${dbName}
    `;
    if (rows.length > 0) {
      console.log(`database ${dbName}: already exists`);
      return;
    }
    // CREATE DATABASE cannot run inside a transaction; name is guarded.
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    console.log(`database ${dbName}: created`);
  } finally {
    await admin.$disconnect();
  }
}

function migrateDeploy(testUrl) {
  const prismaCli = path.join(REPO_ROOT, "node_modules", "prisma", "build", "index.js");
  const result = spawnSync(
    process.execPath,
    [prismaCli, "migrate", "deploy", "--schema", SCHEMA],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_URL: testUrl },
      encoding: "utf8",
    },
  );
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed (exit ${result.status})`);
  }
  return result.stdout ?? "";
}

async function main() {
  const devUrl = readDevDatabaseUrl();
  const testUrl = deriveTestDatabaseUrl(devUrl);
  assertTestDatabaseUrl(testUrl);

  const dbName = TEST_DATABASE_NAME;
  if (dbName !== "oco_logistics_test" || !dbName.endsWith("_test")) {
    console.error(
      `SAFETY: refusing to operate on database "${dbName}" (must be exactly oco_logistics_test).`,
    );
    process.exit(1);
  }

  const adminUrl = deriveAdminDatabaseUrl(devUrl);
  console.log(`test DB name: ${dbName}`);

  await ensureTestDatabaseExists(adminUrl, dbName);

  console.log("migrations: running prisma migrate deploy…");
  const migrateOut = migrateDeploy(testUrl);
  const applied = [...migrateOut.matchAll(/Applying migration[`\s]+([^\s`]+)/gi)].map(
    (m) => m[1],
  );
  if (applied.length > 0) {
    console.log(`migrations applied: ${applied.join(", ")}`);
  } else if (/No pending migrations|already in sync|Datasource/i.test(migrateOut)) {
    console.log("migrations applied: none pending (already up to date)");
  } else {
    console.log("migrations applied: see prisma output above");
  }

  console.log("done.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
