import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { recordShipmentDecision } from "../../apps/web/lib/shipments/record-shipment-decision.ts";
import { getTestPrisma, truncateAll } from "../helpers/test-db.mjs";

/**
 * The unit tests fake Prisma, which proves the LOGIC and nothing about the
 * table. This file is the only place that proves the migration, the generated
 * client and the `@db.Date` columns actually agree — in particular that a
 * calendar day survives the round trip without shifting a day, which is the
 * entire reason the column is DATE and not TIMESTAMP.
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

async function seedShipment() {
  const company = await prisma.company.create({
    data: { name: "Decision Co", contactEmail: "decision@example.test" },
  });
  return prisma.shipment.create({
    data: {
      companyId: company.id,
      weightG: 500,
      lengthCm: 10,
      widthCm: 10,
      heightCm: 10,
      destCity: "Москва",
      recipientName: "Test Recipient",
      recipientPhone: "+79001234567",
      selectionMode: "MANUAL",
    },
  });
}

const OFFERS = [
  {
    offerId: "o1",
    adapterKey: "yataxi:next_day",
    priceRub: 649.4,
    deliveryDayTo: "2026-09-03",
  },
  {
    offerId: "o2",
    adapterKey: "cdek:delivery",
    priceRub: 273.28,
    priceIsEstimate: true,
    deliveryDayTo: "2026-09-01",
  },
];

function args(shipmentId, overrides = {}) {
  return {
    shipmentId,
    offers: OFFERS,
    selectedOfferId: "o1",
    selectionMode: "MANUAL",
    rulesVersion: 1,
    now: new Date("2026-08-31T12:00:00.000Z"),
    ...overrides,
  };
}

// Real Postgres + shared truncate: must run serially.
describe("recordShipmentDecision against a real database", { concurrency: false }, () => {
  test("(i) the row lands, and the calendar day does NOT shift", async () => {
    const shipment = await seedShipment();

    const result = await recordShipmentDecision(prisma, args(shipment.id));
    assert.deepEqual(result, { written: true });

    const row = await prisma.shipmentDecision.findUnique({
      where: { shipmentId: shipment.id },
    });
    assert.ok(row, "a decision row must exist");

    // THE POINT OF THIS FILE: 2026-09-03 in, 2026-09-03 out. A TIMESTAMP column
    // written from Moscow local midnight would come back as the 2nd.
    assert.equal(row.chosenDeadlineDay.toISOString().slice(0, 10), "2026-09-03");
    assert.equal(row.altDeadlineDay.toISOString().slice(0, 10), "2026-09-01");

    assert.equal(row.chosenAdapterKey, "yataxi:next_day");
    assert.equal(row.chosenPriceKop, 64940);
    assert.equal(row.chosenPriceIsEstimate, false);
    assert.equal(row.chosenDeadlineBasis, "CALENDAR_DAY");
    assert.equal(row.altAdapterKey, "cdek:delivery");
    assert.equal(row.altPriceKop, 27328);
    assert.equal(row.altPriceIsEstimate, true);
    assert.equal(row.offersTotal, 2);
    assert.equal(row.carriersTotal, 2);
    assert.equal(row.attributionComplete, true);
    assert.equal(row.selectionMode, "MANUAL");
    assert.equal(row.rulesVersion, 1);
  });

  test("(ii) a second write for the same shipment is SURVIVED and does not overwrite", async () => {
    const shipment = await seedShipment();
    const original = console.error;
    console.error = () => {};
    try {
      await recordShipmentDecision(prisma, args(shipment.id));
      // Same shipment, a different chosen offer: an upsert would rewrite the
      // snapshot. It must not.
      const second = await recordShipmentDecision(
        prisma,
        args(shipment.id, { selectedOfferId: "o2" }),
      );
      assert.deepEqual(second, { written: false, reason: "write_failed" });
    } finally {
      console.error = original;
    }

    const rows = await prisma.shipmentDecision.findMany({
      where: { shipmentId: shipment.id },
    });
    assert.equal(rows.length, 1, "the unique constraint must hold");
    assert.equal(
      rows[0].chosenAdapterKey,
      "yataxi:next_day",
      "the FIRST decision must survive unchanged",
    );
  });

  test("(iii) deleting the shipment cascades the decision away", async () => {
    const shipment = await seedShipment();
    await recordShipmentDecision(prisma, args(shipment.id));

    await prisma.shipment.delete({ where: { id: shipment.id } });

    const rows = await prisma.shipmentDecision.findMany({
      where: { shipmentId: shipment.id },
    });
    assert.equal(rows.length, 0);
  });

  test("(iv) an unusable offers blob writes no row at all", async () => {
    const shipment = await seedShipment();
    const original = console.error;
    console.error = () => {};
    try {
      const result = await recordShipmentDecision(
        prisma,
        args(shipment.id, { offers: [] }),
      );
      assert.deepEqual(result, { written: false, reason: "offers_empty" });
    } finally {
      console.error = original;
    }

    const rows = await prisma.shipmentDecision.findMany();
    assert.equal(rows.length, 0);
  });
});
