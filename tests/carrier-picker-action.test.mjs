import assert from "node:assert/strict";
import test from "node:test";

import {
  describeCarrierPickerAction,
  isRequestAction,
} from "../apps/web/lib/carriers/carrier-picker-action.ts";
import {
  CARRIER_CREDENTIAL_FIELDS,
  isConnectableByOco,
} from "../apps/web/lib/carriers/carrier-credential-fields.ts";

/** Taken from the map, never retyped — the whole point of one declaration. */
const CONNECTABLE = Object.keys(CARRIER_CREDENTIAL_FIELDS);
/** A carrier in the registry that OCO cannot connect itself. */
const NOT_CONNECTABLE = "rupost";

/**
 * THE PROPERTY THAT MAKES A CLIENT IMPORT SAFE. The picker is a client
 * component and reaches this map; the map's old home pulls in
 * @oco/core/crypto/field-encryption and through it node:crypto. A leaf with no
 * imports cannot do that — and typecheck, test:unit and test:db would all pass
 * if someone added one, so the guard has to be here.
 */
test("carrier-credential-fields.ts imports nothing at all", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../apps/web/lib/carriers/carrier-credential-fields.ts", import.meta.url),
    "utf8",
  );

  // ALL THREE WAYS IN, not only the static one. A guard called «imports nothing
  // at all» that watched a single syntax would be a guard on a name it does not
  // keep: `require(...)` and a dynamic `import(...)` reach node:crypto just as
  // well, and the second is easy to add without thinking of this file's rule.
  const offenders = source
    .split(/\r?\n/)
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => !/^\s*\*/.test(line) && !/^\s*\/\//.test(line))
    .filter(
      ({ line }) =>
        /^\s*import\b/.test(line) ||
        /\bfrom\s+["']/.test(line) ||
        /\brequire\s*\(/.test(line) ||
        /\bimport\s*\(/.test(line),
    )
    .map(({ line, number }) => `${number}: ${line.trim()}`);

  assert.deepEqual(
    offenders,
    [],
    "an import here can drag a Node builtin into the browser bundle — see the file's own note",
  );
});

test("the fixture holds: there is something on both sides of the признак", () => {
  assert.ok(CONNECTABLE.length > 0, "no connectable carrier — the tests would be vacuous");
  assert.equal(isConnectableByOco(NOT_CONNECTABLE), false);
});

test("connected → nothing is offered", () => {
  for (const providerKey of [...CONNECTABLE, NOT_CONNECTABLE]) {
    assert.equal(
      describeCarrierPickerAction({ providerKey, isConnected: true }),
      "none",
      `${providerKey}: a connected carrier needs no action`,
    );
  }
});

test("we can connect it → connect, for every key in the map", () => {
  for (const providerKey of CONNECTABLE) {
    assert.equal(
      describeCarrierPickerAction({ providerKey, isConnected: false }),
      "connect",
      `${providerKey} is in CARRIER_CREDENTIAL_FIELDS and must offer a connection`,
    );
  }
});

test("we cannot connect it and no request stands → request", () => {
  assert.equal(
    describeCarrierPickerAction({
      providerKey: NOT_CONNECTABLE,
      isConnected: false,
      pendingRequestAt: null,
    }),
    "request",
  );
});

test("we cannot connect it and a request stands → request_pending", () => {
  assert.equal(
    describeCarrierPickerAction({
      providerKey: NOT_CONNECTABLE,
      isConnected: false,
      pendingRequestAt: "2026-09-01T10:00:00.000Z",
    }),
    "request_pending",
  );
});

/**
 * THE DEFECT THIS SLICE EXISTS FOR, in its nastiest shape. Rows in
 * CarrierConnectionRequest exist for carriers we have since learned to connect.
 * Showing «заявка отправлена» there leaves the seller waiting for us instead of
 * connecting in a minute — the request branch must not win over `connect`.
 */
test("we CAN connect it AND a request already stands → connect, not the request", () => {
  for (const providerKey of CONNECTABLE) {
    assert.equal(
      describeCarrierPickerAction({
        providerKey,
        isConnected: false,
        pendingRequestAt: "2026-09-01T10:00:00.000Z",
      }),
      "connect",
      `${providerKey}: an old request must not hide a connection we can make now`,
    );
  }
});

test("discontinued outranks everything, including a connectable key", () => {
  for (const providerKey of [...CONNECTABLE, NOT_CONNECTABLE]) {
    assert.equal(
      describeCarrierPickerAction({
        providerKey,
        isConnected: false,
        pendingRequestAt: "2026-09-01T10:00:00.000Z",
        discontinued: true,
      }),
      "unavailable",
      `${providerKey}: a carrier that stopped operating is offered nothing`,
    );
  }
});

test("connected outranks a pending request", () => {
  assert.equal(
    describeCarrierPickerAction({
      providerKey: NOT_CONNECTABLE,
      isConnected: true,
      pendingRequestAt: "2026-09-01T10:00:00.000Z",
    }),
    "none",
  );
});

test("only an exact true counts as connected or discontinued", () => {
  for (const value of [1, "yes", "true", {}, []]) {
    assert.equal(
      describeCarrierPickerAction({ providerKey: NOT_CONNECTABLE, isConnected: value }),
      "request",
      `${JSON.stringify(value)} must not read as connected`,
    );
    assert.equal(
      describeCarrierPickerAction({ providerKey: NOT_CONNECTABLE, discontinued: value }),
      "request",
      `${JSON.stringify(value)} must not read as discontinued`,
    );
  }
});

test("a blank pendingRequestAt is not a standing request", () => {
  for (const value of [null, undefined, "", "   ", 0, {}]) {
    assert.equal(
      describeCarrierPickerAction({
        providerKey: NOT_CONNECTABLE,
        isConnected: false,
        pendingRequestAt: value,
      }),
      "request",
      `${String(value)} must not read as a standing request`,
    );
  }
});

/** Never throws: a picker card that crashes is worse than one that over-offers. */
test("unknown shapes yield request instead of throwing", () => {
  for (const input of [undefined, null, {}, [], "nonsense", 42, { providerKey: 7 }]) {
    assert.equal(describeCarrierPickerAction(input), "request");
  }
});

test("isRequestAction names exactly the two request branches", () => {
  assert.equal(isRequestAction("request"), true);
  assert.equal(isRequestAction("request_pending"), true);
  assert.equal(isRequestAction("connect"), false);
  assert.equal(isRequestAction("none"), false);
  assert.equal(isRequestAction("unavailable"), false);
});
