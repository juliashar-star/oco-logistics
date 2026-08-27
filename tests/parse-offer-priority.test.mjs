import assert from "node:assert/strict";
import test from "node:test";

import { parseOfferPriority } from "../apps/web/lib/settings/parse-offer-priority.ts";

/** The parser reads the WHOLE body, because «key absent» is one of its answers. */
const withKey = (value) => ({ senderCity: "Москва", defaultOfferPriority: value });

test("the two honourable values are accepted unchanged", () => {
  assert.deepEqual(parseOfferPriority(withKey("CHEAPEST")), { ok: true, present: true, value: "CHEAPEST" });
  assert.deepEqual(parseOfferPriority(withKey("FASTEST")), { ok: true, present: true, value: "FASTEST" });
});

test("«ничего не подставлять» is an explicit null, not a third value", () => {
  for (const raw of [null, ""]) {
    assert.deepEqual(parseOfferPriority(withKey(raw)), {
      ok: true,
      present: true,
      value: null,
    });
  }
});

// ── absent is NOT null ─────────────────────────────────────────────────────
// The endpoint saves the whole settings card. A request that omits the field
// was not talking about the priority, and reading it as «set to null» would
// wipe a stored preference with nothing on screen saying so.

test("an absent key means DO NOT TOUCH, not «clear it»", () => {
  assert.deepEqual(parseOfferPriority({ senderCity: "Москва" }), {
    ok: true,
    present: false,
  });
});

test("an explicit undefined counts as absent, since JSON drops such keys anyway", () => {
  assert.deepEqual(parseOfferPriority(withKey(undefined)), {
    ok: true,
    present: false,
  });
});

test("a body that is not an object at all is absent, not invalid", () => {
  for (const body of [null, undefined, "", 0, "CHEAPEST"]) {
    assert.deepEqual(
      parseOfferPriority(body),
      { ok: true, present: false },
      `${JSON.stringify(body)} carries no key to read`,
    );
  }
});

test("present-and-null is distinguishable from absent", () => {
  const cleared = parseOfferPriority(withKey(null));
  const untouched = parseOfferPriority({ senderCity: "Москва" });
  assert.notDeepEqual(cleared, untouched);
  assert.equal(cleared.present, true);
  assert.equal(untouched.present, false);
});

test("the OLD vocabulary is rejected, so it cannot leak into the new column", () => {
  // SelectionMode still exists on Shipment with these four. OPTIMAL is the one
  // this product refuses to compute at all — its only implementation scores
  // every carrier with a placeholder — so silently accepting it would store a
  // preference nothing can honour.
  for (const raw of ["OPTIMAL", "FAST", "CHEAP", "MANUAL"]) {
    assert.deepEqual(
      parseOfferPriority(withKey(raw)),
      { ok: false },
      `${raw} must be rejected`,
    );
  }
});

test("anything else is rejected rather than coerced", () => {
  for (const raw of [
    "cheapest",
    "Cheapest",
    " CHEAPEST",
    "CHEAPEST ",
    0,
    1,
    true,
    false,
    {},
    [],
    ["CHEAPEST"],
    "NONE",
    "null",
  ]) {
    assert.deepEqual(
      parseOfferPriority(withKey(raw)),
      { ok: false },
      `${JSON.stringify(raw)} must be rejected`,
    );
  }
});
