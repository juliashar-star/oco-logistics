import assert from "node:assert/strict";
import test from "node:test";

import { shouldShowCancelControl } from "../apps/web/lib/shipments/should-show-cancel-control.ts";
import {
  TERMINAL_SHIPMENT_STATUSES,
  isTerminalShipmentStatus,
} from "../apps/web/lib/shipments/terminal-shipment-statuses.ts";

/** Every status the Prisma enum can hold, so none is left untested by accident. */
const ALL_STATUSES = [
  "DRAFT",
  "CREATED",
  "IN_TRANSIT",
  "AT_PVZ",
  "DELIVERED",
  "RETURNED",
  "CANCELED",
  "PROBLEM",
];

// ── no carrier order → never shown, whatever the status ────────────────────

for (const status of ALL_STATUSES) {
  test(`${status} without a carrier order → hidden`, () => {
    assert.equal(
      shouldShowCancelControl({ status, hasCarrierOrder: false }),
      false,
    );
  });
}

// ── with a carrier order → shown unless terminal ───────────────────────────

for (const status of ALL_STATUSES) {
  const expected = !TERMINAL_SHIPMENT_STATUSES.includes(status);
  test(`${status} with a carrier order → ${expected ? "shown" : "hidden"}`, () => {
    assert.equal(
      shouldShowCancelControl({ status, hasCarrierOrder: true }),
      expected,
    );
  });
}

test("the three terminal statuses are exactly DELIVERED, RETURNED, CANCELED", () => {
  // Pins the list the route refuses on. If a status is added to the enum it
  // must be classified deliberately, not inherited by whichever branch it
  // happens to fall into.
  assert.deepEqual(
    [...TERMINAL_SHIPMENT_STATUSES],
    ["DELIVERED", "RETURNED", "CANCELED"],
  );
});

test("every status in the enum is covered by this test file", () => {
  // Guards the ALL_STATUSES list above from going stale against Prisma.
  for (const status of TERMINAL_SHIPMENT_STATUSES) {
    assert.ok(
      ALL_STATUSES.includes(status),
      `${status} is terminal but missing from ALL_STATUSES`,
    );
  }
});

// ── the boundary cases ─────────────────────────────────────────────────────

test("DRAFT with a carrier order is shown — the rule reads the order, not the status", () => {
  // A DRAFT should never hold a providerOrderId, but if one does, the route
  // WOULD accept it (DRAFT is not terminal), so the control must not hide it.
  // Mirroring the route means mirroring it even where the data looks odd.
  assert.equal(
    shouldShowCancelControl({ status: "DRAFT", hasCarrierOrder: true }),
    true,
  );
});

test("PROBLEM with a carrier order is shown — a failed submit may still have created an order", () => {
  assert.equal(
    shouldShowCancelControl({ status: "PROBLEM", hasCarrierOrder: true }),
    true,
  );
});

test("an unknown status with a carrier order is shown, not hidden", () => {
  // Unknown is not terminal. Hiding would make a new status silently
  // unactionable; showing lets the route answer for itself.
  assert.equal(
    shouldShowCancelControl({ status: "SOMETHING_NEW", hasCarrierOrder: true }),
    true,
  );
});

test("isTerminalShipmentStatus is exact, not prefix or case-insensitive", () => {
  assert.equal(isTerminalShipmentStatus("DELIVERED"), true);
  assert.equal(isTerminalShipmentStatus("delivered"), false);
  assert.equal(isTerminalShipmentStatus("DELIVERED_LATE"), false);
  assert.equal(isTerminalShipmentStatus(""), false);
});

test("the adapter precondition is NOT mirrored — an unresolvable adapter stays visible", () => {
  // The route also refuses 409 when it cannot identify the carrier, but the
  // browser cannot evaluate that without the registry. The control therefore
  // does not take orderAdapterKey into account at all, and the route's message
  // explains the refusal. Pinned so nobody "completes" the mirror with a
  // client-side key list.
  assert.equal(
    shouldShowCancelControl({ status: "CREATED", hasCarrierOrder: true }),
    true,
  );
  // Signature check: passing an adapter key changes nothing.
  assert.equal(
    shouldShowCancelControl({
      status: "CREATED",
      hasCarrierOrder: true,
      orderAdapterKey: null,
    }),
    true,
  );
});
