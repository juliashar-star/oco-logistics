import assert from "node:assert/strict";
import test from "node:test";

import {
  describeSellerReadiness,
  isSellerReadiness,
  isSenderConfigured,
  isStepDone,
  STEP_FLAG,
  STEP_ORDER,
} from "../apps/web/lib/seller-readiness.ts";

/** Everything closed — the baseline the other cases deviate from by one field. */
const READY = {
  emailVerified: true,
  senderCity: "Москва",
  senderPhone: "+79001234567",
  connectedCarrierCount: 1,
  completedShipmentCount: 1,
};

test("all four closed → no next step", () => {
  const r = describeSellerReadiness(READY);
  assert.deepEqual(r, {
    emailVerified: true,
    senderConfigured: true,
    carrierConnected: true,
    hasShipment: true,
    nextStep: null,
    allDone: true,
  });
});

test("nothing done → the first step is the email", () => {
  const r = describeSellerReadiness({
    emailVerified: false,
    senderCity: "",
    senderPhone: "",
    connectedCarrierCount: 0,
    completedShipmentCount: 0,
  });
  assert.equal(r.nextStep, "verify_email");
  assert.equal(r.allDone, false);
});

test("email done, address missing → sender_address", () => {
  const r = describeSellerReadiness({ ...READY, senderCity: "", senderPhone: "" });
  assert.equal(r.senderConfigured, false);
  assert.equal(r.nextStep, "sender_address");
});

/**
 * THE RULE THIS SLICE TURNS ON. The settings route asked only for the city, so a
 * company without a phone passed and was refused at the quote by
 * build-offer-input.ts. Both halves are required here.
 */
test("city without phone is NOT a configured sender", () => {
  const r = describeSellerReadiness({ ...READY, senderPhone: "" });
  assert.equal(r.senderConfigured, false);
  assert.equal(r.nextStep, "sender_address");
});

test("phone without city is NOT a configured sender", () => {
  const r = describeSellerReadiness({ ...READY, senderCity: "" });
  assert.equal(r.senderConfigured, false);
  assert.equal(r.nextStep, "sender_address");
});

test("whitespace is not a value, in either half", () => {
  assert.equal(
    describeSellerReadiness({ ...READY, senderCity: "   " }).senderConfigured,
    false,
  );
  assert.equal(
    describeSellerReadiness({ ...READY, senderPhone: "\t\n " }).senderConfigured,
    false,
  );
});

test("address done, no carrier → connect_carrier", () => {
  const r = describeSellerReadiness({ ...READY, connectedCarrierCount: 0 });
  assert.equal(r.carrierConnected, false);
  assert.equal(r.nextStep, "connect_carrier");
});

test("carrier connected, no shipment → first_shipment", () => {
  const r = describeSellerReadiness({ ...READY, completedShipmentCount: 0 });
  assert.equal(r.hasShipment, false);
  assert.equal(r.nextStep, "first_shipment");
});

/**
 * ORDER, not just membership. A seller with a shipment but no carrier is a state
 * we should never produce, and if we ever do, the answer must still point at the
 * carrier — pointing at the shipment would point at a wall.
 */
test("the carrier is asked for before the first shipment", () => {
  // The state the comment describes: a shipment EXISTS, the carrier does not.
  // With both at zero the assertion held for the wrong reason — connect_carrier
  // simply comes first in the list — and would have passed under any order.
  const r = describeSellerReadiness({
    ...READY,
    connectedCarrierCount: 0,
    completedShipmentCount: 1,
  });
  assert.equal(r.hasShipment, true);
  assert.equal(r.carrierConnected, false);
  assert.equal(r.nextStep, "connect_carrier");
});

test("an earlier open step wins over a later one", () => {
  const r = describeSellerReadiness({
    ...READY,
    emailVerified: false,
    senderPhone: "",
    connectedCarrierCount: 0,
  });
  assert.equal(r.nextStep, "verify_email");
});

test("emailVerified must be exactly true — a truthy value is not a verdict", () => {
  for (const value of [1, "yes", "true", {}, []]) {
    const r = describeSellerReadiness({ ...READY, emailVerified: value });
    assert.equal(r.emailVerified, false, `${JSON.stringify(value)} must not count`);
    assert.equal(r.nextStep, "verify_email");
  }
});

test("a count must be a real positive number — nothing else closes a step", () => {
  for (const value of [0, -1, Number.NaN, Infinity, "1", null, undefined, {}]) {
    const r = describeSellerReadiness({ ...READY, connectedCarrierCount: value });
    assert.equal(
      r.carrierConnected,
      false,
      `${String(value)} must not count as a connection`,
    );
  }
});

/** Never throws: a readiness check that can crash takes down the screen. */
test("unknown shapes leave steps open instead of throwing", () => {
  for (const input of [undefined, null, {}, [], "nonsense", 42, { senderCity: 7 }]) {
    const r = describeSellerReadiness(input);
    assert.equal(r.nextStep, "verify_email");
    assert.equal(r.allDone, false);
  }
});

test("the four flags are reported alongside the step, not only the step", () => {
  const r = describeSellerReadiness({ ...READY, connectedCarrierCount: 0 });
  assert.equal(r.emailVerified, true);
  assert.equal(r.senderConfigured, true);
  assert.equal(r.carrierConnected, false);
  assert.equal(r.hasShipment, true);
});

/**
 * THE ORDER GUARD. The dashboard renders the checklist by mapping STEP_ORDER,
 * so the constant is the only place the order lives. These pin it: a reordering
 * that a screen would silently follow fails here first, with the reason named.
 */
test("STEP_ORDER is the one order, and the carrier precedes the shipment", () => {
  assert.deepEqual(STEP_ORDER, [
    "verify_email",
    "sender_address",
    "connect_carrier",
    "first_shipment",
  ]);
  assert.ok(
    STEP_ORDER.indexOf("connect_carrier") < STEP_ORDER.indexOf("first_shipment"),
    "a shipment is impossible without a carrier — asking for it first points at a wall",
  );
});

test("every step has a flag, and every flag belongs to a step", () => {
  assert.deepEqual(Object.keys(STEP_FLAG).sort(), [...STEP_ORDER].sort());
  const flags = Object.values(STEP_FLAG);
  assert.equal(new Set(flags).size, flags.length, "two steps share one flag");
  const readiness = describeSellerReadiness(READY);
  for (const flag of flags) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(readiness, flag),
      `${flag} is not a field of the readiness object`,
    );
  }
});

test("isStepDone reads the flag that belongs to the step", () => {
  const r = describeSellerReadiness({ ...READY, connectedCarrierCount: 0 });
  assert.equal(isStepDone(r, "verify_email"), true);
  assert.equal(isStepDone(r, "sender_address"), true);
  assert.equal(isStepDone(r, "connect_carrier"), false);
  assert.equal(isStepDone(r, "first_shipment"), true);
});

/**
 * nextStep must be the FIRST open step in STEP_ORDER — the property the whole
 * ordering exists for, checked against the constant rather than a retyped list.
 */
test("nextStep is always the first open step in STEP_ORDER", () => {
  const cases = [
    {},
    { emailVerified: false },
    { senderPhone: "" },
    { connectedCarrierCount: 0 },
    { completedShipmentCount: 0 },
    { senderCity: "", connectedCarrierCount: 0 },
    { emailVerified: false, completedShipmentCount: 0 },
  ];
  for (const patch of cases) {
    const r = describeSellerReadiness({ ...READY, ...patch });
    const expected = STEP_ORDER.find((step) => !isStepDone(r, step)) ?? null;
    assert.equal(r.nextStep, expected, `wrong nextStep for ${JSON.stringify(patch)}`);
  }
});

/** The predicate the settings POST shares with the readiness object. */
test("isSenderConfigured requires both halves and ignores whitespace", () => {
  assert.equal(isSenderConfigured("Москва", "+79001234567"), true);
  assert.equal(isSenderConfigured("Москва", ""), false);
  assert.equal(isSenderConfigured("", "+79001234567"), false);
  assert.equal(isSenderConfigured("  ", "+79001234567"), false);
  assert.equal(isSenderConfigured("Москва", "  "), false);
  assert.equal(isSenderConfigured(undefined, undefined), false);
  assert.equal(isSenderConfigured(7, 8), false);
});

/**
 * THE ROLLOUT GUARD. A screen that BLOCKS on this state must tell «нет
 * перевозчика» from «поле не пришло», so anything but a well-formed object is
 * rejected and read as «не знаю».
 */
test("isSellerReadiness accepts a well-formed object", () => {
  assert.equal(isSellerReadiness(describeSellerReadiness(READY)), true);
  assert.equal(
    isSellerReadiness(describeSellerReadiness({ ...READY, connectedCarrierCount: 0 })),
    true,
  );
});

test("isSellerReadiness rejects anything a stale route could send", () => {
  const good = describeSellerReadiness(READY);
  for (const value of [
    undefined,
    null,
    {},
    [],
    "readiness",
    42,
    { ...good, carrierConnected: undefined },
    { ...good, carrierConnected: "true" },
    { ...good, allDone: 1 },
    { ...good, nextStep: "something_else" },
    { ...good, nextStep: 3 },
  ]) {
    assert.equal(
      isSellerReadiness(value),
      false,
      `${JSON.stringify(value) ?? String(value)} must not be trusted`,
    );
  }
});

test("isSellerReadiness accepts a null nextStep — that is the done state", () => {
  const done = describeSellerReadiness(READY);
  assert.equal(done.nextStep, null);
  assert.equal(isSellerReadiness(done), true);
});
