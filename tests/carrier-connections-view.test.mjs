import assert from "node:assert/strict";
import test from "node:test";

import { CARRIER_CONNECT_FIELDS } from "../apps/web/lib/carriers/carrier-connect-fields.ts";
import { buildCarrierConnectionsView } from "../apps/web/lib/carriers/carrier-connections-view.ts";
import { CARRIER_CREDENTIAL_FIELDS } from "../apps/web/lib/carriers/connect-carrier-credentials.ts";

const ALL_KEYS = Object.keys(CARRIER_CREDENTIAL_FIELDS);

function view(connected = []) {
  return buildCarrierConnectionsView(CARRIER_CONNECT_FIELDS, connected);
}

// ── connected state

test("nothing connected → every carrier present, all isConnected false", () => {
  const carriers = view([]);
  assert.equal(carriers.length, ALL_KEYS.length);
  for (const carrier of carriers) {
    assert.equal(carrier.isConnected, false, carrier.providerKey);
  }
});

test("one connected → only that carrier is marked connected", () => {
  const carriers = view(["cdek"]);
  const byKey = Object.fromEntries(carriers.map((c) => [c.providerKey, c]));
  assert.equal(byKey.cdek.isConnected, true);
  assert.equal(byKey.yataxi.isConnected, false);
});

test("all connected → every carrier is marked connected", () => {
  const carriers = view(ALL_KEYS);
  for (const carrier of carriers) {
    assert.equal(carrier.isConnected, true, carrier.providerKey);
  }
});

test("an unknown key among the connected ones changes nothing", () => {
  const carriers = view(["not-a-carrier"]);
  for (const carrier of carriers) {
    assert.equal(carrier.isConnected, false, carrier.providerKey);
  }
});

// ── coverage: the tab must offer everything the service can actually connect

test("every carrier the connect service can handle appears, with a real plain name", () => {
  const carriers = view([]);
  assert.deepEqual(
    carriers.map((c) => c.providerKey).sort(),
    [...ALL_KEYS].sort(),
    "a connectable carrier missing here would be unreachable from the tab",
  );

  const byKey = Object.fromEntries(carriers.map((c) => [c.providerKey, c]));
  // Plain names on THIS tab, by decision — «Перевозчик №N» would be unusable
  // where a seller connects their own account.
  assert.equal(byKey.yataxi.displayName, "Яндекс Доставка");
  assert.equal(byKey.cdek.displayName, "СДЭК");
  for (const carrier of carriers) {
    assert.ok(
      !carrier.displayName.includes(carrier.providerKey),
      `${carrier.providerKey}: the internal key must not be the displayed name`,
    );
  }
});

// ── field descriptors travel intact

test("fields come through with their kinds; the token and the API password are secret", () => {
  const byKey = Object.fromEntries(view([]).map((c) => [c.providerKey, c]));

  const yandex = Object.fromEntries(
    byKey.yataxi.fields.map((f) => [f.name, f]),
  );
  assert.equal(yandex.platformStationId.kind, "text");
  assert.equal(yandex.token.kind, "secret");

  const cdek = Object.fromEntries(byKey.cdek.fields.map((f) => [f.name, f]));
  assert.equal(cdek.account.kind, "text");
  assert.equal(cdek.securePassword.kind, "secret");
  assert.equal(cdek.contractType.kind, "choice");

  // Every field carries a non-empty seller-facing label.
  for (const carrier of view([])) {
    for (const field of carrier.fields) {
      assert.ok(field.label.length > 0, `${field.name} has no label`);
      assert.notEqual(field.label, field.name, `${field.name} shows its raw key`);
    }
  }
});

test("contractType arrives as a choice whose options name the contract, not the digit", () => {
  const cdek = view([]).find((c) => c.providerKey === "cdek");
  const contractType = cdek.fields.find((f) => f.name === "contractType");

  assert.deepEqual(
    contractType.options.map((o) => o.value),
    ["1", "2"],
    "option values must be exactly what the adapter accepts",
  );
  for (const option of contractType.options) {
    assert.ok(option.label.length > 0);
    assert.notEqual(option.label, option.value, "the digit is not a label");
    assert.ok(
      !/^\s*[12]\s*$/.test(option.label),
      `option ${option.value} label just repeats the digit`,
    );
  }
});

test("only choice fields carry options", () => {
  for (const carrier of view([])) {
    for (const field of carrier.fields) {
      assert.equal(
        field.options !== undefined,
        field.kind === "choice",
        `${carrier.providerKey}.${field.name}: options must accompany kind "choice" and nothing else`,
      );
    }
  }
});

// ── nothing credential-shaped can travel

test("the shape carries no credential value — keys are limited to descriptor metadata", () => {
  const FIELD_KEYS = new Set(["name", "label", "kind", "options"]);
  const OPTION_KEYS = new Set(["value", "label"]);
  const CARRIER_KEYS = new Set([
    "providerKey",
    "displayName",
    "isConnected",
    "fields",
  ]);

  for (const carrier of view(ALL_KEYS)) {
    for (const key of Object.keys(carrier)) {
      assert.ok(CARRIER_KEYS.has(key), `unexpected carrier key: ${key}`);
    }
    for (const field of carrier.fields) {
      for (const key of Object.keys(field)) {
        assert.ok(FIELD_KEYS.has(key), `unexpected field key: ${key}`);
      }
      for (const option of field.options ?? []) {
        for (const key of Object.keys(option)) {
          assert.ok(OPTION_KEYS.has(key), `unexpected option key: ${key}`);
        }
      }
    }
  }
});

test("no credential-bearing word appears anywhere in the serialised view", () => {
  const serialized = JSON.stringify(view(ALL_KEYS));
  for (const needle of ["credentials", "credentialsEnc", "companyId"]) {
    assert.ok(!serialized.includes(needle), `view leaked ${needle}`);
  }
});

// ── an unnamed carrier is an operator's problem, and the throw must say which

test("a provider key absent from the registry throws, and the message names that key", () => {
  const missingKey = "not-in-the-registry";
  assert.throws(
    () => buildCarrierConnectionsView({ [missingKey]: [] }, []),
    (error) => {
      assert.ok(error instanceof Error);
      assert.ok(
        error.message.includes(missingKey),
        `the throw must name the offending key: ${error.message}`,
      );
      return true;
    },
  );
});

// ── drift: descriptors are derived, so names cannot drift; kinds and options can

test("DRIFT GUARD: descriptors cover exactly the service's fields, in order", () => {
  for (const [providerKey, spec] of Object.entries(CARRIER_CREDENTIAL_FIELDS)) {
    assert.deepEqual(
      CARRIER_CONNECT_FIELDS[providerKey].map((f) => f.name),
      spec.map((f) => f.name),
      `${providerKey}: the form would ask for a different set of fields than the service requires`,
    );
  }
  assert.deepEqual(
    Object.keys(CARRIER_CONNECT_FIELDS).sort(),
    [...ALL_KEYS].sort(),
  );
});

test("DRIFT GUARD: a choice field's options match the adapter's allowed values exactly", () => {
  for (const [providerKey, spec] of Object.entries(CARRIER_CREDENTIAL_FIELDS)) {
    const described = Object.fromEntries(
      CARRIER_CONNECT_FIELDS[providerKey].map((f) => [f.name, f]),
    );
    for (const field of spec) {
      if (field.allowed === undefined) continue;
      assert.deepEqual(
        described[field.name].options.map((o) => o.value),
        [...field.allowed],
        `${providerKey}.${field.name}: the form would offer values the adapter does not accept`,
      );
    }
  }
});
