import assert from "node:assert/strict";
import test from "node:test";

import { CARRIER_REGISTRY } from "../packages/core/src/carrier-picker/registry.ts";
import {
  CARRIER_CREDENTIAL_FIELDS,
  isConnectableByOco,
} from "../apps/web/lib/carriers/carrier-credential-fields.ts";

/**
 * THE GUARD BETWEEN THE FACT AND THE PROMISE.
 *
 * `CARRIER_CREDENTIAL_FIELDS` is a fact about the code: this carrier has a
 * credential bag, a verifier and a form. `Carrier.connectableViaOco` is the same
 * thing put on a shop window — the public comparison page reads it for the
 * «Доступность в OCO» column, and its reader is someone who is not our seller
 * yet.
 *
 * Two statements of one thing drift. Until 04.09.2026 this one had drifted all
 * the way: `true` on all twelve entries, including a discontinued carrier and
 * nine with no adapter at all.
 *
 * WHY THE GUARD LIVES HERE, in the top-level tests, and not inside either
 * package. It needs both sides, and the two packages deliberately do not import
 * each other: `packages/core` never imports `apps/web`, and the credential leaf
 * never imports `@oco/core`. A top-level test is the third place that depends on
 * both and is depended on by neither — putting the check inside either package
 * would create exactly the dependency the architecture avoids.
 */

test("the fixture holds: the registry is not empty", () => {
  assert.ok(CARRIER_REGISTRY.length > 0, "an empty registry would make this vacuous");
});

test("connectableViaOco matches whether OCO can actually connect the carrier", () => {
  for (const carrier of CARRIER_REGISTRY) {
    const canConnect = isConnectableByOco(carrier.providerKey);
    assert.equal(
      carrier.connectableViaOco === true,
      canConnect,
      canConnect
        ? `${carrier.providerKey}: OCO can connect it, but the public comparison page will say it cannot`
        : `${carrier.providerKey}: the public comparison page promises a connection OCO cannot make`,
    );
  }
});

/**
 * The field is optional in the type, and an absent value reads as `false` on the
 * page. That is fine for a carrier we cannot connect and a silent lie for one we
 * can, so the connectable ones must say it out loud.
 */
test("every connectable carrier states it explicitly, never by omission", () => {
  for (const carrier of CARRIER_REGISTRY) {
    if (isConnectableByOco(carrier.providerKey)) {
      assert.equal(
        carrier.connectableViaOco,
        true,
        `${carrier.providerKey}: must set connectableViaOco explicitly, not leave it undefined`,
      );
    }
  }
});

/**
 * A carrier that stopped operating cannot be connected whatever else is true of
 * it. Checked separately because it is the case the old all-true value got most
 * obviously wrong.
 */
test("a discontinued carrier is never advertised as connectable", () => {
  const discontinued = CARRIER_REGISTRY.filter(
    (carrier) => carrier.healthStatus === "discontinued",
  );
  assert.ok(discontinued.length > 0, "no discontinued carrier — this test would be vacuous");
  for (const carrier of discontinued) {
    assert.notEqual(
      carrier.connectableViaOco,
      true,
      `${carrier.providerKey} is discontinued and must not be offered`,
    );
  }
});

/**
 * THE DIRECTION THE LOOP ABOVE CANNOT SEE. It walks the REGISTRY, so it can
 * only judge carriers the registry already knows. A providerKey added to
 * CARRIER_CREDENTIAL_FIELDS with no registry entry passes it silently — and
 * then `buildCarrierConnectionsView` throws at runtime («no registry display
 * name»), because there is no honest plain name to show and the internal key
 * must not reach a browser.
 *
 * This replaces a count check that only restated the per-entry equality: with
 * every registry row already agreeing, the two lengths could not differ.
 */
test("every carrier OCO can connect exists in the registry", () => {
  const known = new Set(CARRIER_REGISTRY.map((carrier) => carrier.providerKey));
  for (const providerKey of Object.keys(CARRIER_CREDENTIAL_FIELDS)) {
    assert.ok(
      known.has(providerKey),
      `${providerKey}: OCO can connect it, but the registry has no entry — the connection tab throws for a carrier with no display name`,
    );
  }
});
