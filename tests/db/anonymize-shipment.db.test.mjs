import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, test } from "node:test";

import { anonymizeShipment } from "../../apps/web/lib/shipments/anonymize-shipment.ts";
import {
  RULES_VERSION,
  buildShipmentDecision,
} from "../../packages/core/src/shipment-decision.ts";
import { getTestPrisma, truncateAll } from "../helpers/test-db.mjs";

/**
 * The unit guard proves the LIST is complete. This file is the only place that
 * proves the WRITE reaches all three Json columns and stops at the shipment it
 * was given — neither is visible without a real database, and the `where` on an
 * updateMany is exactly the kind of mistake that looks fine in review.
 */

const PII_ENV = "RECIPIENT_PII_ENCRYPTION_KEY";
/** Self-contained test key — never read real .env secrets. */
const TEST_PII_KEY = `test-recipient-pii-${randomBytes(24).toString("hex")}`;
assert.ok(TEST_PII_KEY.length >= 32, "test PII key must be >= 32 chars");

/** @type {import("@prisma/client").PrismaClient} */
let prisma;

beforeEach(async () => {
  prisma = getTestPrisma();
  await truncateAll(prisma);
  process.env[PII_ENV] = TEST_PII_KEY;
});

afterEach(async () => {
  await truncateAll(prisma);
  delete process.env[PII_ENV];
});

const OFFERS = [
  {
    offerId: "o1",
    adapterKey: "yataxi:next_day",
    priceRub: 649.4,
    deliveryDayTo: "2026-09-03",
    rawOffer: { offer_id: "o1", pricing: { total: "649.40" }, station_id: "st-1" },
  },
];

async function seedCarrier() {
  return prisma.carrier.upsert({
    where: { apishipCode: "anonymize-test" },
    update: {},
    create: { apishipCode: "anonymize-test", name: "ANONYMIZE-TEST", isActive: true },
  });
}

async function seedCompany(email) {
  return prisma.company.create({
    data: { name: "Anonymize Co", contactEmail: email },
  });
}

/** A shipment with all three Json columns populated and both late-added fields set. */
async function seedShipmentWithEverything(companyId, carrierId, suffix) {
  const shipment = await prisma.shipment.create({
    data: {
      companyId,
      weightG: 500,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
      destCity: "Москва",
      destAddress: `ciphertext-address-${suffix}`,
      destApartment: `ciphertext-apartment-${suffix}`,
      deliveryComment: `ciphertext-comment-${suffix}`,
      pvzCode: `PVZ-${suffix}`,
      recipientName: `ciphertext-name-${suffix}`,
      recipientPhone: `ciphertext-phone-${suffix}`,
      quotedOffers: OFFERS,
    },
  });

  await prisma.tariffQuote.create({
    data: {
      companyId,
      shipmentId: shipment.id,
      carrierId,
      serviceCode: "cdek:136",
      cost: 27328,
      pickupType: "PVZ",
      rawResponse: { calculator: { to: { addressString: "ул. Тестовая, 1" } } },
    },
  });

  await prisma.trackingEvent.create({
    data: {
      shipmentId: shipment.id,
      statusCode: "IN_TRANSIT",
      statusText: "В пути",
      location: "Москва",
      eventAt: new Date("2026-09-01T10:00:00.000Z"),
      rawResponse: { recipient: { phone: "+79001234567" } },
    },
  });

  return shipment;
}

describe("anonymizeShipment", { concurrency: false }, () => {
  test("(i) all three Json columns are empty afterwards", async () => {
    const company = await seedCompany(`anon-json-${Date.now()}@example.test`);
    const carrier = await seedCarrier();
    const shipment = await seedShipmentWithEverything(company.id, carrier.id, "a");

    // Pin the starting state: without this the assertions below could pass on
    // columns that were never populated.
    const before = await prisma.shipment.findUnique({ where: { id: shipment.id } });
    assert.ok(before.quotedOffers, "quotedOffers must be populated before the test acts");
    const quoteBefore = await prisma.tariffQuote.findFirst({
      where: { shipmentId: shipment.id },
    });
    assert.ok(quoteBefore.rawResponse, "TariffQuote.rawResponse must be populated");
    const eventBefore = await prisma.trackingEvent.findFirst({
      where: { shipmentId: shipment.id },
    });
    assert.ok(eventBefore.rawResponse, "TrackingEvent.rawResponse must be populated");

    const result = await anonymizeShipment(prisma, {
      shipmentId: shipment.id,
      companyId: company.id,
    });
    assert.deepEqual(result, { ok: true });

    const after = await prisma.shipment.findUnique({ where: { id: shipment.id } });
    assert.equal(after.quotedOffers, null, "Shipment.quotedOffers must be cleared");

    const quoteAfter = await prisma.tariffQuote.findFirst({
      where: { shipmentId: shipment.id },
    });
    assert.equal(quoteAfter.rawResponse, null, "TariffQuote.rawResponse must be cleared");

    const eventAfter = await prisma.trackingEvent.findFirst({
      where: { shipmentId: shipment.id },
    });
    assert.equal(
      eventAfter.rawResponse,
      null,
      "TrackingEvent.rawResponse must be cleared — the «low PII risk» exemption is gone",
    );
  });

  test("(ii) destApartment and deliveryComment are cleared, not left behind", async () => {
    const company = await seedCompany(`anon-fields-${Date.now()}@example.test`);
    const carrier = await seedCarrier();
    const shipment = await seedShipmentWithEverything(company.id, carrier.id, "b");

    const before = await prisma.shipment.findUnique({ where: { id: shipment.id } });
    assert.equal(before.destApartment, "ciphertext-apartment-b");
    assert.equal(before.deliveryComment, "ciphertext-comment-b");

    await anonymizeShipment(prisma, { shipmentId: shipment.id, companyId: company.id });

    const after = await prisma.shipment.findUnique({ where: { id: shipment.id } });
    assert.equal(after.destApartment, null, "destApartment survived anonymisation");
    assert.equal(after.deliveryComment, null, "deliveryComment survived anonymisation");
    // The rest of the list, so a regression cannot hide behind the two new ones.
    assert.equal(after.recipientName, "УДАЛЕНО");
    assert.equal(after.recipientPhone, "УДАЛЕНО");
    assert.equal(after.destAddress, "УДАЛЕНО");
    assert.equal(after.destCity, "УДАЛЕНО");
    assert.equal(after.pvzCode, null);
    assert.equal(after.isAnonymized, true);
  });

  test("(iii) submit's guard fires before the empty snapshot is ever parsed", async () => {
    const company = await seedCompany(`anon-submit-${Date.now()}@example.test`);
    const carrier = await seedCarrier();
    const shipment = await seedShipmentWithEverything(company.id, carrier.id, "c");

    await anonymizeShipment(prisma, { shipmentId: shipment.id, companyId: company.id });

    // What the submit route selects, in the order it reads it. The route itself
    // needs auth + Next and is not executed here; what IS proven is that its
    // guard's input is set, so the 409 on `row.isAnonymized` is reached before
    // `findQuotedOffer(row.quotedOffers, …)` on the line below it.
    const row = await prisma.shipment.findUnique({
      where: { id: shipment.id },
      select: { isAnonymized: true, quotedOffers: true },
    });
    assert.equal(row.isAnonymized, true, "the guard that answers 409 must see true");
    assert.equal(row.quotedOffers, null);

    // And if it were ever reached, the parser tolerates the empty column rather
    // than throwing: `Array.isArray(null)` is false, so it returns a reason.
    const built = buildShipmentDecision({
      offers: row.quotedOffers,
      selectedOfferId: "o1",
      rulesVersion: RULES_VERSION,
      now: new Date(),
    });
    assert.deepEqual(built, { ok: false, reason: "offers_not_an_array" });
  });

  test("(iv) another shipment's tracking events and quotes are untouched", async () => {
    const company = await seedCompany(`anon-border-${Date.now()}@example.test`);
    const carrier = await seedCarrier();
    const target = await seedShipmentWithEverything(company.id, carrier.id, "d");
    const bystander = await seedShipmentWithEverything(company.id, carrier.id, "e");

    await anonymizeShipment(prisma, { shipmentId: target.id, companyId: company.id });

    const otherShipment = await prisma.shipment.findUnique({
      where: { id: bystander.id },
    });
    assert.ok(otherShipment.quotedOffers, "the other shipment's snapshot was blanked");
    assert.equal(otherShipment.isAnonymized, false);
    assert.equal(otherShipment.destApartment, "ciphertext-apartment-e");

    const otherQuote = await prisma.tariffQuote.findFirst({
      where: { shipmentId: bystander.id },
    });
    assert.ok(otherQuote.rawResponse, "the other shipment's TariffQuote was blanked");

    const otherEvent = await prisma.trackingEvent.findFirst({
      where: { shipmentId: bystander.id },
    });
    assert.ok(
      otherEvent.rawResponse,
      "the other shipment's TrackingEvent was blanked — updateMany lost its where",
    );
  });

  test("(v) a second call is refused rather than repeated", async () => {
    const company = await seedCompany(`anon-twice-${Date.now()}@example.test`);
    const carrier = await seedCarrier();
    const shipment = await seedShipmentWithEverything(company.id, carrier.id, "f");

    await anonymizeShipment(prisma, { shipmentId: shipment.id, companyId: company.id });
    const second = await anonymizeShipment(prisma, {
      shipmentId: shipment.id,
      companyId: company.id,
    });
    assert.deepEqual(second, { ok: false, reason: "already_anonymized" });
  });

  test("(vi) another company's shipment is refused and left intact", async () => {
    const owner = await seedCompany(`anon-owner-${Date.now()}@example.test`);
    const stranger = await seedCompany(`anon-stranger-${Date.now()}@example.test`);
    const carrier = await seedCarrier();
    const shipment = await seedShipmentWithEverything(owner.id, carrier.id, "g");

    const result = await anonymizeShipment(prisma, {
      shipmentId: shipment.id,
      companyId: stranger.id,
    });
    assert.deepEqual(result, { ok: false, reason: "forbidden" });

    const after = await prisma.shipment.findUnique({ where: { id: shipment.id } });
    assert.equal(after.isAnonymized, false);
    assert.ok(after.quotedOffers);
  });
});
