import test from "node:test";
import assert from "node:assert/strict";

import { recordShipmentDecision } from "../apps/web/lib/shipments/record-shipment-decision.ts";

/**
 * The write is faked, not stubbed at the network: this module's whole contract
 * is «never throw, whatever the database does», and that is only provable by
 * making the database misbehave on demand.
 *
 * console.error is silenced per test — the module logs deliberately, and a
 * passing suite should not print alarm text that is the expected behaviour.
 */
function fakePrisma({ onCreate } = {}) {
  const created = [];
  return {
    created,
    shipmentDecision: {
      create: async (args) => {
        if (onCreate) {
          await onCreate(args);
        }
        created.push(args.data);
        return { id: "decision-1", ...args.data };
      },
    },
  };
}

function silenceErrors() {
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args);
  return {
    lines,
    restore: () => {
      console.error = original;
    },
  };
}

const NOW = new Date("2026-08-31T12:00:00.000Z");

const GOOD_OFFERS = [
  {
    offerId: "o1",
    adapterKey: "yataxi:next_day",
    priceRub: 500,
    deliveryDayTo: "2026-09-03",
  },
  {
    offerId: "o2",
    adapterKey: "cdek:delivery",
    priceRub: 400,
    priceIsEstimate: true,
    deliveryDayTo: "2026-09-03",
  },
];

function args(overrides = {}) {
  return {
    shipmentId: "ship-1",
    offers: GOOD_OFFERS,
    selectedOfferId: "o1",
    selectionMode: "MANUAL",
    rulesVersion: 1,
    now: NOW,
    ...overrides,
  };
}

// -------------------------------------------------------------- happy path

test("a usable decision is written, with the calendar day as a UTC-midnight Date", async () => {
  const prisma = fakePrisma();
  const result = await recordShipmentDecision(prisma, args());

  assert.deepEqual(result, { written: true });
  assert.equal(prisma.created.length, 1);

  const row = prisma.created[0];
  assert.equal(row.shipmentId, "ship-1");
  assert.equal(row.rulesVersion, 1);
  assert.equal(row.decidedAt, NOW);
  assert.equal(row.selectionMode, "MANUAL");
  assert.equal(row.chosenAdapterKey, "yataxi:next_day");
  assert.equal(row.chosenPriceKop, 50000);
  assert.equal(row.chosenPriceIsEstimate, false);
  assert.equal(row.chosenDeadlineBasis, "CALENDAR_DAY");
  assert.equal(row.chosenDeadlineDay.toISOString(), "2026-09-03T00:00:00.000Z");
  assert.equal(row.altAdapterKey, "cdek:delivery");
  assert.equal(row.altPriceKop, 40000);
  assert.equal(row.altPriceIsEstimate, true);
  assert.equal(row.altDeadlineDay.toISOString(), "2026-09-03T00:00:00.000Z");
  assert.equal(row.offersTotal, 2);
  assert.equal(row.carriersTotal, 2);
  assert.equal(row.attributionComplete, true);
});

test("a null selectionMode is carried through as null, not invented", async () => {
  const prisma = fakePrisma();
  await recordShipmentDecision(prisma, args({ selectionMode: null }));
  assert.equal(prisma.created[0].selectionMode, null);
});

test("no deadline anywhere writes nulls, not a fabricated date", async () => {
  const prisma = fakePrisma();
  await recordShipmentDecision(
    prisma,
    args({
      offers: [{ offerId: "o1", adapterKey: "cdek:delivery", priceRub: 100 }],
    }),
  );
  assert.equal(prisma.created[0].chosenDeadlineDay, null);
  assert.equal(prisma.created[0].chosenDeadlineBasis, null);
  assert.equal(prisma.created[0].altDeadlineDay, null);
  assert.equal(prisma.created[0].altPriceIsEstimate, null);
});

// ------------------------------------------------ ok:false writes nothing

test("an unusable decision writes NOTHING and reports the reason", async () => {
  const silenced = silenceErrors();
  try {
    for (const [offers, selectedOfferId, expected] of [
      [[], "o1", "offers_empty"],
      ["not an array", "o1", "offers_not_an_array"],
      [GOOD_OFFERS, "missing", "selected_offer_not_found"],
      [
        [{ offerId: "o1", priceRub: 100 }],
        "o1",
        "selected_offer_has_no_adapter_key",
      ],
      [
        [{ offerId: "o1", adapterKey: "cdek:delivery" }],
        "o1",
        "selected_offer_has_no_price",
      ],
    ]) {
      const prisma = fakePrisma();
      const result = await recordShipmentDecision(
        prisma,
        args({ offers, selectedOfferId }),
      );
      assert.deepEqual(result, { written: false, reason: expected });
      assert.equal(prisma.created.length, 0, `${expected} must not write`);
    }
  } finally {
    silenced.restore();
  }
});

test("a skipped decision is logged with the shipment id and the reason", async () => {
  const silenced = silenceErrors();
  try {
    await recordShipmentDecision(prisma_none(), args({ offers: [] }));
  } finally {
    silenced.restore();
  }
  assert.equal(silenced.lines.length, 1);
  assert.equal(silenced.lines[0][0], "[recordShipmentDecision] SKIPPED");
  assert.deepEqual(silenced.lines[0][1], {
    shipmentId: "ship-1",
    reason: "offers_empty",
  });
});

function prisma_none() {
  return fakePrisma();
}

// -------------------------------------------- a failing database is survived

test("a Prisma failure does NOT escape — the order outranks the report", async () => {
  const silenced = silenceErrors();
  let result;
  try {
    const prisma = fakePrisma({
      onCreate: async () => {
        const error = new Error("connection lost");
        error.name = "PrismaClientKnownRequestError";
        throw error;
      },
    });
    result = await recordShipmentDecision(prisma, args());
  } finally {
    silenced.restore();
  }
  assert.deepEqual(result, { written: false, reason: "write_failed" });
});

test("a unique-constraint collision is survived, not resolved by an upsert", async () => {
  const silenced = silenceErrors();
  let result;
  try {
    const prisma = fakePrisma({
      onCreate: async () => {
        const error = new Error(
          "Unique constraint failed on the fields: (`shipmentId`)",
        );
        error.name = "PrismaClientKnownRequestError";
        error.code = "P2002";
        throw error;
      },
    });
    result = await recordShipmentDecision(prisma, args());
  } finally {
    silenced.restore();
  }
  assert.deepEqual(result, { written: false, reason: "write_failed" });
  assert.equal(silenced.lines[0][0], "[recordShipmentDecision] WRITE_FAILED");
});

test("a thrown non-Error is survived too", async () => {
  const silenced = silenceErrors();
  let result;
  try {
    const prisma = fakePrisma({
      onCreate: async () => {
        throw "a bare string";
      },
    });
    result = await recordShipmentDecision(prisma, args());
  } finally {
    silenced.restore();
  }
  assert.deepEqual(result, { written: false, reason: "write_failed" });
  assert.equal(silenced.lines[0][1].error, "unknown");
});

test("the failure log carries a code-like name only — never the offers blob", async () => {
  const silenced = silenceErrors();
  try {
    const prisma = fakePrisma({
      onCreate: async () => {
        const error = new Error("recipient Иван Петров +79001234567");
        error.name = "PrismaClientValidationError";
        throw error;
      },
    });
    await recordShipmentDecision(prisma, args());
  } finally {
    silenced.restore();
  }
  const logged = JSON.stringify(silenced.lines[0]);
  assert.equal(silenced.lines[0][1].error, "PrismaClientValidationError");
  assert.ok(!logged.includes("Иван"), "the message text must not be logged");
  assert.ok(!logged.includes("79001234567"), "no phone in the log");
  assert.ok(!logged.includes("offerId"), "the offers blob must not be logged");
});

test("a prisma client missing the model entirely is survived", async () => {
  const silenced = silenceErrors();
  let result;
  try {
    result = await recordShipmentDecision({}, args());
  } finally {
    silenced.restore();
  }
  assert.deepEqual(result, { written: false, reason: "write_failed" });
});
