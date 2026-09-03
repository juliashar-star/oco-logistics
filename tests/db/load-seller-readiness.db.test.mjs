import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { loadSellerReadiness } from "../../apps/web/lib/load-seller-readiness.ts";
import { getTestPrisma, truncateAll } from "../helpers/test-db.mjs";

/**
 * The unit tests prove the RULES on plain values. This file is the only place
 * that proves the two COUNTS ask the database the right question — in
 * particular that a DRAFT does not count as a shipment, which is the exact
 * point on which the dashboard and the shipments list disagreed.
 */

/** @type {import("@prisma/client").PrismaClient} */
let prisma;

beforeEach(async () => {
  prisma = getTestPrisma();
  await truncateAll(prisma);
});

afterEach(async () => {
  await truncateAll(prisma);
});

async function seedCompany(email, sender = {}) {
  return prisma.company.create({
    data: {
      name: "Readiness Co",
      contactEmail: email,
      senderCity: sender.senderCity ?? null,
      senderPhone: sender.senderPhone ?? null,
    },
  });
}

async function seedShipment(companyId, status) {
  return prisma.shipment.create({
    data: {
      companyId,
      weightG: 500,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
      destCity: "Москва",
      recipientName: "ciphertext-name",
      recipientPhone: "ciphertext-phone",
      status,
    },
  });
}

function load(company, emailVerified = true) {
  return loadSellerReadiness(prisma, {
    companyId: company.id,
    emailVerified,
    senderCity: company.senderCity,
    senderPhone: company.senderPhone,
  });
}

describe("loadSellerReadiness", { concurrency: false }, () => {
  test("(i) a brand-new company has every step open, email first", async () => {
    const company = await seedCompany(`ready-new-${Date.now()}@example.test`);

    const readiness = await load(company, false);

    assert.deepEqual(readiness, {
      emailVerified: false,
      senderConfigured: false,
      carrierConnected: false,
      hasShipment: false,
      nextStep: "verify_email",
      allDone: false,
    });
  });

  test("(ii) a city with no phone leaves the sender step open", async () => {
    const company = await seedCompany(`ready-city-${Date.now()}@example.test`, {
      senderCity: "Москва",
    });

    const readiness = await load(company);

    assert.equal(readiness.senderConfigured, false);
    assert.equal(readiness.nextStep, "sender_address");
  });

  test("(iii) a stored credential closes the carrier step", async () => {
    const company = await seedCompany(`ready-carrier-${Date.now()}@example.test`, {
      senderCity: "Москва",
      senderPhone: "+79001234567",
    });

    const before = await load(company);
    assert.equal(before.carrierConnected, false);
    assert.equal(before.nextStep, "connect_carrier");

    await prisma.carrierCredential.create({
      data: {
        companyId: company.id,
        providerKey: "cdek",
        credentialsEnc: "ciphertext-not-a-real-bag",
      },
    });

    const after = await load(company);
    assert.equal(after.carrierConnected, true);
    assert.equal(after.nextStep, "first_shipment");
  });

  /** THE DIVERGENCE THIS SLICE REMOVES. */
  test("(iv) a DRAFT is not a shipment, and neither is SUBMITTING", async () => {
    const company = await seedCompany(`ready-draft-${Date.now()}@example.test`, {
      senderCity: "Москва",
      senderPhone: "+79001234567",
    });
    await prisma.carrierCredential.create({
      data: {
        companyId: company.id,
        providerKey: "yataxi",
        credentialsEnc: "ciphertext-not-a-real-bag",
      },
    });

    await seedShipment(company.id, "DRAFT");
    await seedShipment(company.id, "SUBMITTING");

    const readiness = await load(company);
    assert.equal(
      readiness.hasShipment,
      false,
      "a started-and-abandoned order must not close the last step",
    );
    assert.equal(readiness.nextStep, "first_shipment");
  });

  test("(v) a CREATED shipment closes the last step", async () => {
    const company = await seedCompany(`ready-created-${Date.now()}@example.test`, {
      senderCity: "Москва",
      senderPhone: "+79001234567",
    });
    await prisma.carrierCredential.create({
      data: {
        companyId: company.id,
        providerKey: "yataxi",
        credentialsEnc: "ciphertext-not-a-real-bag",
      },
    });
    await seedShipment(company.id, "DRAFT");
    await seedShipment(company.id, "CREATED");

    const readiness = await load(company);
    assert.equal(readiness.hasShipment, true);
    assert.equal(readiness.nextStep, null);
    assert.equal(readiness.allDone, true);
  });

  test("(vi) another company's rows do not close this company's steps", async () => {
    const mine = await seedCompany(`ready-mine-${Date.now()}@example.test`, {
      senderCity: "Москва",
      senderPhone: "+79001234567",
    });
    const theirs = await seedCompany(`ready-theirs-${Date.now()}@example.test`);

    await prisma.carrierCredential.create({
      data: {
        companyId: theirs.id,
        providerKey: "cdek",
        credentialsEnc: "ciphertext-not-a-real-bag",
      },
    });
    await seedShipment(theirs.id, "CREATED");

    const readiness = await load(mine);
    assert.equal(readiness.carrierConnected, false);
    assert.equal(readiness.hasShipment, false);
    assert.equal(readiness.nextStep, "connect_carrier");
  });
});
