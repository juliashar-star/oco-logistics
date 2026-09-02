import test from "node:test";
import assert from "node:assert/strict";

import {
  offerPriorityFromSelectionMode,
  resolveSelectionModeFromPreselect,
} from "../apps/web/lib/shipments/resolve-selection-mode.ts";

const run = (reason, priority) =>
  resolveSelectionModeFromPreselect({ reason, priority });

// ------------------------------------------------------- the rule did speak

test("rule + FASTEST -> FAST", () => {
  assert.equal(run("rule", "FASTEST"), "FAST");
});

test("rule + CHEAPEST -> CHEAP", () => {
  assert.equal(run("rule", "CHEAPEST"), "CHEAP");
});

test("tie + FASTEST -> FAST — the criterion RAN, it just did not single one out", () => {
  assert.equal(run("tie", "FASTEST"), "FAST");
});

test("tie + CHEAPEST -> CHEAP", () => {
  assert.equal(run("tie", "CHEAPEST"), "CHEAP");
});

// ------------------------------------- the rule spoke but named no criterion

test("rule without a priority -> null, because WHICH criterion is unknown", () => {
  assert.equal(run("rule", null), null);
  assert.equal(run("rule", undefined), null);
});

test("tie without a priority -> null", () => {
  assert.equal(run("tie", null), null);
});

// ------------------------------------------------- the rule did not speak

test("single -> null: a list of one is not a criterion being applied", () => {
  assert.equal(run("single", "FASTEST"), null);
  assert.equal(run("single", "CHEAPEST"), null);
  assert.equal(run("single", null), null);
});

test("no_rule -> null", () => {
  assert.equal(run("no_rule", null), null);
  // Even if a priority somehow rides along, no_rule means none was applied.
  assert.equal(run("no_rule", "FASTEST"), null);
});

test("not_applicable -> null, whatever the priority was", () => {
  assert.equal(run("not_applicable", "CHEAPEST"), null);
  assert.equal(run("not_applicable", "FASTEST"), null);
  assert.equal(run("not_applicable", null), null);
});

// -------------------------------------------------------- hostile input

test("an unknown reason -> null, and does not throw", () => {
  for (const reason of [
    "RULE",
    "Rule",
    "rules",
    "",
    "   ",
    null,
    undefined,
    7,
    {},
    [],
    true,
  ]) {
    assert.equal(run(reason, "FASTEST"), null, `reason ${JSON.stringify(reason)}`);
  }
});

test("an unknown priority beside a rule verdict -> null, and does not throw", () => {
  for (const priority of [
    "fastest",
    "FAST",
    "CHEAP",
    "OPTIMAL",
    "",
    0,
    {},
    [],
    true,
  ]) {
    assert.equal(run("rule", priority), null, `priority ${JSON.stringify(priority)}`);
  }
});

test("a missing input object shape does not throw", () => {
  assert.equal(resolveSelectionModeFromPreselect({}), null);
});

// --------------------------------------------------------- the whole matrix

test("every reason x every priority, as one table", () => {
  const REASONS = ["rule", "tie", "single", "no_rule", "not_applicable"];
  const PRIORITIES = ["FASTEST", "CHEAPEST", null];

  const actual = REASONS.map((reason) =>
    PRIORITIES.map((priority) => run(reason, priority)),
  );

  assert.deepEqual(actual, [
    ["FAST", "CHEAP", null], // rule
    ["FAST", "CHEAP", null], // tie
    [null, null, null], // single
    [null, null, null], // no_rule
    [null, null, null], // not_applicable
  ]);
});

test("OPTIMAL is unreachable from a preselect verdict", () => {
  const REASONS = ["rule", "tie", "single", "no_rule", "not_applicable"];
  const PRIORITIES = ["FASTEST", "CHEAPEST", null, "OPTIMAL"];
  for (const reason of REASONS) {
    for (const priority of PRIORITIES) {
      assert.notEqual(run(reason, priority), "OPTIMAL");
    }
  }
});

test("MANUAL is never produced here — only the form may write it", () => {
  const REASONS = ["rule", "tie", "single", "no_rule", "not_applicable", "junk"];
  const PRIORITIES = ["FASTEST", "CHEAPEST", null, "MANUAL"];
  for (const reason of REASONS) {
    for (const priority of PRIORITIES) {
      assert.notEqual(run(reason, priority), "MANUAL");
    }
  }
});

// ============================================================================
// offerPriorityFromSelectionMode — the inverse, and the reason no column exists
// ============================================================================

test("FAST -> FASTEST", () => {
  assert.equal(offerPriorityFromSelectionMode("FAST"), "FASTEST");
});

test("CHEAP -> CHEAPEST", () => {
  assert.equal(offerPriorityFromSelectionMode("CHEAP"), "CHEAPEST");
});

test("MANUAL -> null: the seller departed from the rule, none was applied", () => {
  assert.equal(offerPriorityFromSelectionMode("MANUAL"), null);
});

test("OPTIMAL -> null: the older path chose without an OfferPriority", () => {
  assert.equal(offerPriorityFromSelectionMode("OPTIMAL"), null);
});

test("null -> null", () => {
  assert.equal(offerPriorityFromSelectionMode(null), null);
  assert.equal(offerPriorityFromSelectionMode(undefined), null);
});

test("an unrecognised mode -> null, and does not throw", () => {
  for (const mode of ["fast", "FASTEST", "", "   ", 7, {}, [], true]) {
    assert.equal(offerPriorityFromSelectionMode(mode), null, JSON.stringify(mode));
  }
});

test("every SelectionMode value, as one table", () => {
  assert.deepEqual(
    ["FAST", "CHEAP", "OPTIMAL", "MANUAL", null].map(
      offerPriorityFromSelectionMode,
    ),
    ["FASTEST", "CHEAPEST", null, null, null],
  );
});

test("the two functions round-trip on the values that carry a criterion", () => {
  // rule + FASTEST -> FAST -> FASTEST, and the same for CHEAPEST. This is the
  // property that makes a stored appliedPriority column redundant.
  for (const priority of ["FASTEST", "CHEAPEST"]) {
    const mode = resolveSelectionModeFromPreselect({ reason: "rule", priority });
    assert.equal(offerPriorityFromSelectionMode(mode), priority);
  }
});
