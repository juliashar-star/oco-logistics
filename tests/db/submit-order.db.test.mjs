import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import {
  YandexAuthError,
  YandexOfferExpiredError,
} from "../../packages/core/src/carrier-adapter/yandex/client.ts";
import { submitOrder } from "../../apps/web/lib/shipments/submit-order.ts";
import { getTestPrisma, truncateAll } from "../helpers/test-db.mjs";

/** @type {import("@prisma/client").PrismaClient} */
let prisma;

beforeEach(async () => {
  prisma = getTestPrisma();
  await truncateAll(prisma);
});

afterEach(async () => {
  await truncateAll(prisma);
  await prisma.$disconnect();
});

const OFFER = {
  offerId: "offer-test-1",
  expiresAt: "2026-07-13T18:00:00+03:00",
  deliveryIntervalFrom: "2026-07-14T10:00:00+03:00",
  deliveryIntervalTo: "2026-07-14T14:00:00+03:00",
  pickupIntervalFrom: "2026-07-13T16:00:00+03:00",
  pickupIntervalTo: "2026-07-13T18:00:00+03:00",
  priceRub: 273.28,
};

const CREDS = { platformStationId: "station-1", token: "test-token" };

/**
 * @param {string} companyName
 * @param {string} email
 * @param {{ idempotencyKey?: string }} [extra]
 */
async function seedDraftShipment(companyName, email, extra = {}) {
  const company = await prisma.company.create({
    data: {
      name: companyName,
      contactEmail: email,
    },
  });
  const shipment = await prisma.shipment.create({
    data: {
      companyId: company.id,
      weightG: 500,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
      destCity: "Москва",
      recipientName: "Test Recipient",
      recipientPhone: "+79001234567",
      idempotencyKey: extra.idempotencyKey ?? `idem-${Date.now()}-${Math.random()}`,
    },
  });
  return { company, shipment };
}

/**
 * @param {import("@prisma/client").PrismaClient} client
 * @param {string} shipmentId
 */
async function assertNotSubmitting(client, shipmentId) {
  const row = await client.shipment.findUnique({ where: { id: shipmentId } });
  assert.ok(row);
  assert.notEqual(row.status, "SUBMITTING");
  return row;
}

/**
 * Wrap prisma.shipment.updateMany so selected call indices reject.
 * Indices are 1-based among updateMany calls on this wrapper.
 * findFirst always hits the real client (capture + finally net).
 *
 * @param {import("@prisma/client").PrismaClient} client
 * @param {Set<number>} rejectAt
 */
function wrapUpdateManyRejecting(client, rejectAt) {
  let updateManyCalls = 0;
  return {
    ...client,
    shipment: {
      ...client.shipment,
      findFirst: (...args) => client.shipment.findFirst(...args),
      findUnique: (...args) => client.shipment.findUnique(...args),
      updateMany: async (args) => {
        updateManyCalls += 1;
        if (rejectAt.has(updateManyCalls)) {
          throw new Error(`simulated updateMany failure #${updateManyCalls}`);
        }
        return client.shipment.updateMany(args);
      },
    },
  };
}

// Real Postgres + shared truncate: serial only.
describe("submitOrder", { concurrency: false }, () => {
  test("(i) capture fails (already SUBMITTING) → confirm not called", async () => {
    const { company, shipment } = await seedDraftShipment(
      "Capture Fail Co",
      `submit-capture-${Date.now()}@example.com`,
    );
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: { status: "SUBMITTING", submittingAt: new Date() },
    });

    let confirmCalls = 0;
    const result = await submitOrder(prisma, {
      shipmentId: shipment.id,
      companyId: company.id,
      offer: OFFER,
      credentials: CREDS,
      confirm: async () => {
        confirmCalls += 1;
        return { requestId: "should-not-run", rawResponse: {} };
      },
    });

    assert.deepEqual(result, {
      ok: false,
      stage: "capture",
      reason: "not_draft",
    });
    assert.equal(confirmCalls, 0);
    // Invariant is "never SUBMITTING AFTER A SUCCESSFUL CAPTURE"; case (i)
    // never captured, so the pre-existing in-flight row is intentionally untouched.
    const row = await prisma.shipment.findUnique({ where: { id: shipment.id } });
    assert.ok(row);
    assert.equal(row.status, "SUBMITTING");
  });

  test("(ii) confirm success → CREATED + providerOrderId + plannedDeliveryDate", async () => {
    const { company, shipment } = await seedDraftShipment(
      "Success Co",
      `submit-ok-${Date.now()}@example.com`,
    );
    const REQUEST_ID = "yandex-request-ok-1";

    const result = await submitOrder(prisma, {
      shipmentId: shipment.id,
      companyId: company.id,
      offer: OFFER,
      credentials: CREDS,
      confirm: async (offerId, credentials) => {
        assert.equal(offerId, OFFER.offerId);
        assert.deepEqual(credentials, CREDS);
        return { requestId: REQUEST_ID, rawResponse: { request_id: REQUEST_ID } };
      },
    });

    assert.deepEqual(result, { ok: true, requestId: REQUEST_ID });

    const row = await assertNotSubmitting(prisma, shipment.id);
    assert.equal(row.status, "CREATED");
    assert.equal(row.providerOrderId, REQUEST_ID);
    assert.equal(row.providerKey, "yataxi");
    assert.equal(row.selectedOfferId, OFFER.offerId);
    assert.ok(row.plannedDeliveryDate instanceof Date);
    assert.equal(
      row.plannedDeliveryDate.toISOString(),
      new Date(OFFER.deliveryIntervalFrom).toISOString(),
    );
    assert.ok(row.selectedOfferExpiresAt instanceof Date);
    assert.equal(
      row.selectedOfferExpiresAt.toISOString(),
      new Date(OFFER.expiresAt).toISOString(),
    );
    assert.equal(row.plannedCost, 27328);
    assert.notEqual(row.plannedCost, 273);
  });

  test("(iii) YandexOfferExpiredError → DRAFT, submittingAt cleared", async () => {
    const { company, shipment } = await seedDraftShipment(
      "Expired Co",
      `submit-expired-${Date.now()}@example.com`,
    );

    const result = await submitOrder(prisma, {
      shipmentId: shipment.id,
      companyId: company.id,
      offer: OFFER,
      credentials: CREDS,
      confirm: async () => {
        throw new YandexOfferExpiredError("offer_was_not_found");
      },
    });

    assert.deepEqual(result, {
      ok: false,
      stage: "confirm",
      reason: "offer_expired",
    });

    const row = await assertNotSubmitting(prisma, shipment.id);
    assert.equal(row.status, "DRAFT");
    assert.equal(row.submittingAt, null);
  });

  test("(iv) YandexAuthError → PROBLEM", async () => {
    const { company, shipment } = await seedDraftShipment(
      "Auth Co",
      `submit-auth-${Date.now()}@example.com`,
    );

    const result = await submitOrder(prisma, {
      shipmentId: shipment.id,
      companyId: company.id,
      offer: OFFER,
      credentials: CREDS,
      confirm: async () => {
        throw new YandexAuthError("HTTP 401");
      },
    });

    assert.deepEqual(result, {
      ok: false,
      stage: "confirm",
      reason: "auth",
    });

    const row = await assertNotSubmitting(prisma, shipment.id);
    assert.equal(row.status, "PROBLEM");
  });

  test("(v) generic Error (network) → PROBLEM, not DRAFT", async () => {
    const { company, shipment } = await seedDraftShipment(
      "Network Co",
      `submit-net-${Date.now()}@example.com`,
    );

    const result = await submitOrder(prisma, {
      shipmentId: shipment.id,
      companyId: company.id,
      offer: OFFER,
      credentials: CREDS,
      confirm: async () => {
        throw new Error("network timeout");
      },
    });

    assert.deepEqual(result, {
      ok: false,
      stage: "confirm",
      reason: "unknown",
    });

    const row = await assertNotSubmitting(prisma, shipment.id);
    assert.equal(row.status, "PROBLEM");
    assert.notEqual(row.status, "DRAFT");
  });

  test("(vi) confirm succeeds but CREATED write fails → PROBLEM + providerOrderId", async () => {
    const { company, shipment } = await seedDraftShipment(
      "Write Fail Co",
      `submit-writefail-${Date.now()}@example.com`,
      { idempotencyKey: "idem-write-fail-1" },
    );
    const REQUEST_ID = "yandex-request-writefail-1";

    // 1 = capture; 2 = CREATED (reject); 3 = salvage PROBLEM (ok); finally no-op.
    const wrapped = wrapUpdateManyRejecting(prisma, new Set([2]));

    const result = await submitOrder(wrapped, {
      shipmentId: shipment.id,
      companyId: company.id,
      offer: OFFER,
      credentials: CREDS,
      confirm: async () => ({
        requestId: REQUEST_ID,
        rawResponse: { request_id: REQUEST_ID },
      }),
    });

    assert.deepEqual(result, {
      ok: false,
      stage: "write-after-confirm",
      requestId: REQUEST_ID,
    });

    const row = await assertNotSubmitting(prisma, shipment.id);
    assert.equal(row.status, "PROBLEM");
    assert.equal(row.providerOrderId, REQUEST_ID);
  });

  test("(vii) DOUBLE-FAILURE: CREATED + salvage both throw → finally-net forces PROBLEM", async () => {
    const { company, shipment } = await seedDraftShipment(
      "Double Fail Co",
      `submit-doublefail-${Date.now()}@example.com`,
      { idempotencyKey: "idem-double-fail-1" },
    );
    const REQUEST_ID = "yandex-request-doublefail-1";

    // 1 = capture; 2 = CREATED (reject); 3 = salvage (reject); 4 = finally-net PROBLEM.
    const wrapped = wrapUpdateManyRejecting(prisma, new Set([2, 3]));

    const result = await submitOrder(wrapped, {
      shipmentId: shipment.id,
      companyId: company.id,
      offer: OFFER,
      credentials: CREDS,
      confirm: async () => ({
        requestId: REQUEST_ID,
        rawResponse: { request_id: REQUEST_ID },
      }),
    });

    // try outcome preserved (write-after-confirm); finally only fixes status.
    assert.deepEqual(result, {
      ok: false,
      stage: "write-after-confirm",
      requestId: REQUEST_ID,
    });

    const row = await assertNotSubmitting(prisma, shipment.id);
    assert.equal(row.status, "PROBLEM");
    assert.equal(row.providerOrderId, REQUEST_ID);
  });

  test("(viii) confirm-error DRAFT write throws → finally-net forces PROBLEM", async () => {
    const { company, shipment } = await seedDraftShipment(
      "Expired Write Fail Co",
      `submit-expired-writefail-${Date.now()}@example.com`,
    );

    // 1 = capture; 2 = DRAFT rollback on expired (reject); 3 = finally-net PROBLEM.
    const wrapped = wrapUpdateManyRejecting(prisma, new Set([2]));

    await assert.rejects(
      () =>
        submitOrder(wrapped, {
          shipmentId: shipment.id,
          companyId: company.id,
          offer: OFFER,
          credentials: CREDS,
          confirm: async () => {
            throw new YandexOfferExpiredError("offer_was_not_found");
          },
        }),
      /simulated updateMany failure #2/,
    );

    const row = await assertNotSubmitting(prisma, shipment.id);
    assert.equal(row.status, "PROBLEM");
  });
});
