import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { requestCarrierConnection } from "../../apps/web/lib/carriers/request-carrier-connection.ts";
import { CARRIER_CREDENTIAL_FIELDS } from "../../apps/web/lib/carriers/carrier-credential-fields.ts";
import { getTestPrisma, truncateAll } from "../helpers/test-db.mjs";

/**
 * The unit tests prove the DECISION. This file is the only place that proves
 * what the decision does to the table — in particular that a refusal writes
 * nothing and, more importantly, DESTROYS nothing: rows for carriers we have
 * since learned to connect exist in the database today, and a refusal must walk
 * past them, not tidy them away.
 */

/** From the map, never retyped. */
const CONNECTABLE = Object.keys(CARRIER_CREDENTIAL_FIELDS)[0];
/** In the registry, not connectable by OCO, not discontinued. */
const NOT_CONNECTABLE = "rupost";

/** @type {import("@prisma/client").PrismaClient} */
let prisma;

beforeEach(async () => {
  prisma = getTestPrisma();
  await truncateAll(prisma);
});

afterEach(async () => {
  await truncateAll(prisma);
});

async function seedCompany(email) {
  return prisma.company.create({
    data: { name: "Picker Co", contactEmail: email },
  });
}

async function countRequests(companyId) {
  return prisma.carrierConnectionRequest.count({ where: { companyId } });
}

describe("requestCarrierConnection", { concurrency: false }, () => {
  test("(i) a carrier OCO can connect is REFUSED and no row is written", async () => {
    const company = await seedCompany(`req-refuse-${Date.now()}@example.test`);

    const before = await countRequests(company.id);
    assert.equal(before, 0);

    const result = await requestCarrierConnection(prisma, {
      companyId: company.id,
      providerKey: CONNECTABLE,
    });

    assert.deepEqual(result, { status: "connectable_by_oco" });
    assert.equal(
      await countRequests(company.id),
      0,
      "a refusal must not write a request row",
    );
  });

  test("(ii) a carrier OCO cannot connect is still allowed, and the row appears", async () => {
    const company = await seedCompany(`req-allow-${Date.now()}@example.test`);

    const result = await requestCarrierConnection(prisma, {
      companyId: company.id,
      providerKey: NOT_CONNECTABLE,
    });

    assert.equal(result.status, "created");
    assert.ok(result.createdAt instanceof Date);

    const rows = await prisma.carrierConnectionRequest.findMany({
      where: { companyId: company.id },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].providerKey, NOT_CONNECTABLE);
  });

  test("(iii) a repeated request does NOT create a second row", async () => {
    const company = await seedCompany(`req-twice-${Date.now()}@example.test`);

    const first = await requestCarrierConnection(prisma, {
      companyId: company.id,
      providerKey: NOT_CONNECTABLE,
    });
    assert.equal(first.status, "created");

    const second = await requestCarrierConnection(prisma, {
      companyId: company.id,
      providerKey: NOT_CONNECTABLE,
    });
    assert.equal(second.status, "already_requested");
    assert.equal(
      second.createdAt.toISOString(),
      first.createdAt.toISOString(),
      "the original timestamp must survive — the row was not rewritten",
    );

    assert.equal(await countRequests(company.id), 1, "exactly one row, not two");
  });

  /**
   * THE BOUNDARY. Rows for a now-connectable carrier are in the database today,
   * left from before OCO could connect it. The refusal must not touch them —
   * neither delete them nor rewrite their timestamp.
   */
  test("(iv) refusing does not touch an existing row for that same carrier", async () => {
    const company = await seedCompany(`req-border-${Date.now()}@example.test`);

    const legacy = await prisma.carrierConnectionRequest.create({
      data: { companyId: company.id, providerKey: CONNECTABLE },
    });

    const result = await requestCarrierConnection(prisma, {
      companyId: company.id,
      providerKey: CONNECTABLE,
    });
    assert.deepEqual(result, { status: "connectable_by_oco" });

    const after = await prisma.carrierConnectionRequest.findUnique({
      where: { id: legacy.id },
    });
    assert.ok(after, "the legacy row was deleted by a refusal");
    assert.equal(
      after.createdAt.toISOString(),
      legacy.createdAt.toISOString(),
      "the legacy row was rewritten by a refusal",
    );
    assert.equal(await countRequests(company.id), 1);
  });

  test("(v) another company's rows are untouched by a refusal", async () => {
    const owner = await seedCompany(`req-owner-${Date.now()}@example.test`);
    const bystander = await seedCompany(`req-bystander-${Date.now()}@example.test`);

    await prisma.carrierConnectionRequest.create({
      data: { companyId: bystander.id, providerKey: NOT_CONNECTABLE },
    });

    await requestCarrierConnection(prisma, {
      companyId: owner.id,
      providerKey: CONNECTABLE,
    });

    assert.equal(await countRequests(bystander.id), 1);
    assert.equal(await countRequests(owner.id), 0);
  });

  test("(vi) an unknown provider key is refused before anything is written", async () => {
    const company = await seedCompany(`req-unknown-${Date.now()}@example.test`);

    const result = await requestCarrierConnection(prisma, {
      companyId: company.id,
      providerKey: "not-a-carrier",
    });

    assert.deepEqual(result, { status: "unknown_provider" });
    assert.equal(await countRequests(company.id), 0);
  });
});
