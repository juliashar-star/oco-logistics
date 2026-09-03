import assert from "node:assert/strict";
import test from "node:test";

import {
  CALCULATION_GATE_MESSAGES,
  READINESS_TIMEOUT_MS,
  createSubmitGate,
  resolveCalculationGate,
} from "../apps/web/lib/shipments/calculation-gate.ts";
import { describeSellerReadiness } from "../apps/web/lib/seller-readiness.ts";

const READY_NO_CARRIER = {
  status: "ready",
  value: describeSellerReadiness({
    emailVerified: true,
    senderCity: "Москва",
    senderPhone: "+79001234567",
    connectedCarrierCount: 0,
    completedShipmentCount: 0,
  }),
};

const READY_ALL = {
  status: "ready",
  value: describeSellerReadiness({
    emailVerified: true,
    senderCity: "Москва",
    senderPhone: "+79001234567",
    connectedCarrierCount: 1,
    completedShipmentCount: 0,
  }),
};

const READY_NO_PHONE = {
  status: "ready",
  value: describeSellerReadiness({
    emailVerified: true,
    senderCity: "Москва",
    senderPhone: "",
    connectedCarrierCount: 1,
    completedShipmentCount: 0,
  }),
};

/** A loader that never settles — the hung-request case. */
function neverResolves() {
  return new Promise(() => {});
}

/**
 * (1) THE DEFECT THIS FILE EXISTS FOR. While the answer is still coming, the
 * gate must WAIT for it and refuse — not fall through to create-draft. The
 * previous shape awaited a loader that returned void and then read the answer
 * back from React state, where it had not landed yet.
 */
test("(1) still loading → waits for the answer and refuses; no draft", async () => {
  let loads = 0;
  const decision = await resolveCalculationGate({
    state: { status: "loading" },
    load: async () => {
      loads += 1;
      return READY_NO_CARRIER;
    },
  });
  assert.equal(loads, 1, "the gate must actually ask");
  assert.equal(decision.proceed, false);
  assert.equal(decision.reason, "no_carrier");
  assert.equal(
    CALCULATION_GATE_MESSAGES[decision.reason],
    "Подключите перевозчика в настройках, чтобы рассчитать доставку",
  );
});

test("(1a) the decision comes from the RETURNED value, not from the passed state", async () => {
  // The state says «loading» and the loader answers «connected». If the gate
  // read anything but the return value it could not know that.
  const decision = await resolveCalculationGate({
    state: { status: "loading" },
    load: async () => READY_ALL,
  });
  assert.equal(decision.proceed, true);
  assert.equal(decision.state.status, "ready");
});

/**
 * (2) A FINISHED-AND-FAILED request is the real «не знаю». There the screen
 * degrades: the draft IS created and the seller learns from the route's 400.
 */
test("(2) request finished with a failure → proceeds, draft is created", async () => {
  const fromUnavailable = await resolveCalculationGate({
    state: { status: "unavailable" },
    load: async () => {
      throw new Error("load must not be called for a settled state");
    },
  });
  assert.equal(fromUnavailable.proceed, true);

  const loaderThrew = await resolveCalculationGate({
    state: { status: "loading" },
    load: async () => {
      throw new Error("network");
    },
  });
  assert.equal(loaderThrew.proceed, true, "a thrown loader must degrade, not block");
  assert.equal(loaderThrew.state.status, "unavailable");
});

test("(2a) sender is refused only on a known-bad sender, and after the carrier", async () => {
  const noPhone = await resolveCalculationGate({
    state: READY_NO_PHONE,
    load: async () => READY_NO_PHONE,
  });
  assert.equal(noPhone.proceed, false);
  assert.equal(noPhone.reason, "no_sender");

  // Both missing → the carrier is named first: without one there is nothing to
  // quote at all.
  const both = await resolveCalculationGate({
    state: {
      status: "ready",
      value: describeSellerReadiness({
        emailVerified: true,
        senderCity: "",
        senderPhone: "",
        connectedCarrierCount: 0,
        completedShipmentCount: 0,
      }),
    },
    load: async () => READY_NO_CARRIER,
  });
  assert.equal(both.reason, "no_carrier");
});

/**
 * (3) DOUBLE CLICK, in one tick. A useState flag cannot see its own change
 * within the same tick; this guard can.
 */
test("(3) two entries in one tick → only the first passes", () => {
  const gate = createSubmitGate();
  const first = gate.tryEnter();
  const second = gate.tryEnter();
  assert.equal(first, true);
  assert.equal(second, false, "a double click must not run the handler twice");
  assert.equal(gate.isBusy(), true);
  gate.release();
  assert.equal(gate.isBusy(), false);
  assert.equal(gate.tryEnter(), true, "after release the next submit may run");
});

test("(3a) a whole double click produces ONE run of the guarded work", async () => {
  const gate = createSubmitGate();
  const drafts = [];
  async function submit() {
    if (!gate.tryEnter()) return;
    try {
      const decision = await resolveCalculationGate({
        state: READY_ALL,
        load: async () => READY_ALL,
      });
      if (decision.proceed) drafts.push("create-draft");
    } finally {
      gate.release();
    }
  }
  // Both fired before either awaits — that is what a double click is.
  await Promise.all([submit(), submit()]);
  assert.deepEqual(drafts, ["create-draft"], "exactly one draft, not two");
});

/**
 * (4) A HUNG REQUEST must not leave the button reading «Проверяем настройки...»
 * forever. On expiry the state becomes `unavailable` — the ordinary degradation
 * path, never a hang.
 */
test("(4) a request that never settles times out into unavailable", async () => {
  const started = Date.now();
  const decision = await resolveCalculationGate({
    state: { status: "loading" },
    load: neverResolves,
    timeoutMs: 5,
  });
  assert.equal(decision.proceed, true, "a timeout degrades, it does not block");
  assert.equal(decision.state.status, "unavailable");
  assert.ok(Date.now() - started < 2_000, "it must not have waited the real timeout");
});

test("(4a) an answer that arrives before the timeout still wins", async () => {
  const decision = await resolveCalculationGate({
    state: { status: "loading" },
    load: async () => READY_NO_CARRIER,
    timeoutMs: 1_000,
  });
  assert.equal(decision.proceed, false);
  assert.equal(decision.reason, "no_carrier");
});

/**
 * THE EXACT VALUE, not «a positive number». `docs/SELLER_READINESS.md` §7 and
 * the ADR both promise five seconds to a reader who will never open this file;
 * a loose assertion let the constant move and leave those promises false.
 */
test("(4b) the timeout is five seconds, the value the documents promise", () => {
  assert.equal(
    READINESS_TIMEOUT_MS,
    5_000,
    "SELLER_READINESS.md §7 says five seconds — change both or neither",
  );
});
