import test from "node:test";
import assert from "node:assert/strict";

import { parseSelectionMode } from "../apps/web/lib/shipments/resolve-selection-mode.ts";

/**
 * THE REAL PARSER, IMPORTED — not a copy of its shape.
 *
 * An earlier revision of this file re-implemented the parse locally and
 * asserted against the copy. It passed whatever the routes did, which is the
 * definition of a test that guards nothing. Both creation and submit now call
 * `parseSelectionMode`, so breaking it breaks this file.
 *
 * What the two callers do with the RESULT differs on purpose and is asserted
 * here as a contract rather than duplicated:
 *   - create/route.ts  → `ok: false` becomes HTTP 400; nothing exists yet.
 *   - submit/route.ts  → `ok: false` becomes null and a log line; a carrier
 *     order may already exist, and the order outranks the report.
 */

const accepts = (raw, expected) => {
  const parsed = parseSelectionMode(raw);
  assert.equal(parsed.ok, true, `expected ok for ${JSON.stringify(raw)}`);
  assert.equal(parsed.value, expected);
};

const rejects = (raw) => {
  const parsed = parseSelectionMode(raw);
  assert.equal(parsed.ok, false, `expected reject for ${JSON.stringify(raw)}`);
  assert.equal("value" in parsed, false, "a rejection carries no value");
};

// ------------------------------------------------------ blank is legal → null

test("an ABSENT value is accepted and becomes null, not MANUAL", () => {
  accepts(undefined, null);
});

test("an explicit null is accepted and stays null", () => {
  accepts(null, null);
});

test("an empty string is accepted and becomes null", () => {
  accepts("", null);
});

// ----------------------------------------------- every real value still passes

test("all four SelectionMode values are accepted unchanged", () => {
  for (const mode of ["FAST", "CHEAP", "OPTIMAL", "MANUAL"]) {
    accepts(mode, mode);
  }
});

// -------------------------------------------------------- rubbish is rejected

test("a non-empty value outside the set is rejected", () => {
  for (const mode of ["FASTEST", "CHEAPEST", "fast", "Manual", "junk"]) {
    rejects(mode);
  }
});

test("a value with stray whitespace is rejected — the parser does not trim", () => {
  // Deliberate: trimming would let "   " become null and read later as «no mode
  // was determined», turning a malformed client into a recorded fact.
  for (const mode of ["   ", " FAST", "FAST ", "\tCHEAP"]) {
    rejects(mode);
  }
});

test("a non-string non-empty value is rejected, not coerced", () => {
  for (const raw of [7, 0, true, false, {}, [], ["FAST"]]) {
    rejects(raw);
  }
});

// --------------------------------------------------------------- the contract

test("a rejection is distinguishable from a null value — the callers depend on it", () => {
  const blank = parseSelectionMode(null);
  const rubbish = parseSelectionMode("FASTEST");

  assert.deepEqual(blank, { ok: true, value: null });
  assert.deepEqual(rubbish, { ok: false });

  // If these two ever collapse into one shape, create/route.ts loses its 400
  // and submit/route.ts loses the difference between «nobody said» and «the
  // browser sent nonsense» — the log line would fire on every ordinary order.
  assert.notDeepEqual(blank, rubbish);
});

test("the decision for every case, as one table", () => {
  const CASES = [
    [undefined, "accept"],
    [null, "accept"],
    ["", "accept"],
    ["FAST", "accept"],
    ["CHEAP", "accept"],
    ["OPTIMAL", "accept"],
    ["MANUAL", "accept"],
    ["FASTEST", "reject"],
    ["   ", "reject"],
    [0, "reject"],
  ];

  assert.deepEqual(
    CASES.map(([raw]) => (parseSelectionMode(raw).ok ? "accept" : "reject")),
    CASES.map(([, expected]) => expected),
  );
});
