import assert from "node:assert/strict";
import test from "node:test";

import {
  carrierAnchorTarget,
  carrierSectionId,
  resolveCarrierAnchor,
} from "../apps/web/lib/carriers/resolve-carrier-anchor.ts";
import { CARRIER_CREDENTIAL_FIELDS } from "../apps/web/lib/carriers/carrier-credential-fields.ts";

/** From the map, never retyped — a carrier is addressable exactly when connectable. */
const CONNECTABLE = Object.keys(CARRIER_CREDENTIAL_FIELDS);

test("the fixture holds: something is connectable", () => {
  assert.ok(CONNECTABLE.length > 0, "no connectable carrier — these tests would be vacuous");
});

test("a known key resolves to itself", () => {
  for (const providerKey of CONNECTABLE) {
    assert.equal(resolveCarrierAnchor(providerKey), providerKey);
  }
});

test("surrounding whitespace is trimmed, not rejected", () => {
  assert.equal(resolveCarrierAnchor(`  ${CONNECTABLE[0]}  `), CONNECTABLE[0]);
});

/**
 * THE RULE THAT MATTERS. `?carrier=` comes from the address bar, so anything a
 * stranger types reaches this function. An unknown value must vanish silently:
 * no scroll, no error, and above all nothing echoed into the page.
 */
test("an unknown or absent value is ignored silently", () => {
  for (const value of [
    undefined,
    null,
    "",
    "   ",
    "rupost",
    "not-a-carrier",
    "<script>alert(1)</script>",
    "../../etc/passwd",
    42,
    {},
    [],
    true,
  ]) {
    assert.equal(
      resolveCarrierAnchor(value),
      null,
      `${JSON.stringify(value) ?? String(value)} must not become an anchor`,
    );
  }
});

/**
 * A prototype member is truthy on a plain object lookup, and «constructor»
 * would have resolved to a card id for a carrier that does not exist.
 */
test("prototype names are not carriers", () => {
  for (const value of ["constructor", "__proto__", "toString", "valueOf", "hasOwnProperty"]) {
    assert.equal(resolveCarrierAnchor(value), null, `${value} must not resolve`);
  }
});

test("the anchor target needs the card to be on the loaded list", () => {
  const key = CONNECTABLE[0];
  assert.equal(carrierAnchorTarget(key, [key]), key);
  assert.equal(carrierAnchorTarget(key, ["rupost"]), null, "not on the list → no scroll");
  assert.equal(carrierAnchorTarget(key, []), null, "empty list → no scroll");
  assert.equal(carrierAnchorTarget(null, [key]), null, "nothing asked for → no scroll");
});

test("the card id is one definition, used to write and to find", () => {
  const key = CONNECTABLE[0];
  assert.equal(carrierSectionId(key), `carrier-card-${key}`);
  // Distinct per carrier — two cards sharing an id would scroll to the first.
  const ids = new Set(CONNECTABLE.map(carrierSectionId));
  assert.equal(ids.size, CONNECTABLE.length);
});
