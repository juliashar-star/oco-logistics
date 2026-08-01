import assert from "node:assert/strict";
import test from "node:test";

import { selectOrderAdaptersForConnectedCarriers } from "../packages/core/src/carrier-adapter/select-order-adapters-for-connected-carriers.ts";

/** @typedef {import("../packages/core/src/carrier-adapter/order-adapters.ts").OrderAdapter} OrderAdapter */
/** @typedef {import("../packages/core/src/carrier-adapter/types.ts").CarrierCredentials} CarrierCredentials */

/**
 * @param {string} key
 * @param {string} providerKey
 * @returns {OrderAdapter}
 */
function fakeAdapter(key, providerKey) {
  return {
    key,
    providerKey,
    title: key,
    getOffers: async () => {
      throw new Error("getOffers must not be called");
    },
    confirmOffer: async () => {
      throw new Error("confirmOffer must not be called");
    },
    cancelOrder: async () => {
      throw new Error("cancelOrder must not be called");
    },
  };
}

test("keeps adapter only when providerKey is connected; pairs THAT credentials", () => {
  const adapter = fakeAdapter("yataxi:next_day", "yataxi");
  const creds = { token: "yandex-token" };
  const result = selectOrderAdaptersForConnectedCarriers(
    [adapter],
    [{ providerKey: "yataxi", credentials: creds }],
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].adapter, adapter);
  assert.equal(result[0].credentials, creds);
});

test("connected provider with no matching adapter contributes nothing", () => {
  const result = selectOrderAdaptersForConnectedCarriers(
    [fakeAdapter("yataxi:next_day", "yataxi")],
    [{ providerKey: "cdek", credentials: { token: "cdek" } }],
  );
  assert.deepEqual(result, []);
});

test("adapter whose provider is not connected contributes nothing", () => {
  const result = selectOrderAdaptersForConnectedCarriers(
    [
      fakeAdapter("yataxi:next_day", "yataxi"),
      fakeAdapter("cdek:default", "cdek"),
    ],
    [{ providerKey: "yataxi", credentials: { token: "y" } }],
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].adapter.key, "yataxi:next_day");
});

test("preserves adapters order, not connected order", () => {
  const a = fakeAdapter("cdek:default", "cdek");
  const b = fakeAdapter("yataxi:next_day", "yataxi");
  const result = selectOrderAdaptersForConnectedCarriers(
    [a, b],
    [
      { providerKey: "yataxi", credentials: { token: "y" } },
      { providerKey: "cdek", credentials: { token: "c" } },
    ],
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].adapter, a);
  assert.equal(result[1].adapter, b);
});

test("duplicate connected providerKeys: first credentials win; adapter not duplicated", () => {
  const adapter = fakeAdapter("yataxi:next_day", "yataxi");
  const first = { token: "first" };
  const second = { token: "second" };
  const result = selectOrderAdaptersForConnectedCarriers(
    [adapter],
    [
      { providerKey: "yataxi", credentials: first },
      { providerKey: "yataxi", credentials: second },
    ],
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].credentials, first);
  assert.notEqual(result[0].credentials, second);
});

test("empty adapters or empty connected → []", () => {
  const adapter = fakeAdapter("yataxi:next_day", "yataxi");
  const connected = [{ providerKey: "yataxi", credentials: { token: "y" } }];
  assert.deepEqual(selectOrderAdaptersForConnectedCarriers([], connected), []);
  assert.deepEqual(selectOrderAdaptersForConnectedCarriers([adapter], []), []);
});

test("two adapters sharing one providerKey both selected with same credentials object", () => {
  const nextDay = fakeAdapter("yataxi:next_day", "yataxi");
  const express = fakeAdapter("yataxi:express", "yataxi");
  const creds = { token: "shared" };
  const result = selectOrderAdaptersForConnectedCarriers(
    [nextDay, express],
    [{ providerKey: "yataxi", credentials: creds }],
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].adapter, nextDay);
  assert.equal(result[1].adapter, express);
  assert.equal(result[0].credentials, creds);
  assert.equal(result[1].credentials, creds);
});

test("two providers: each adapter gets its OWN credentials (not interchanged)", () => {
  const yandexAdapter = fakeAdapter("yataxi:next_day", "yataxi");
  const cdekAdapter = fakeAdapter("cdek:default", "cdek");
  const yandexCreds = { token: "yandex-only" };
  const cdekCreds = { token: "cdek-only" };
  const result = selectOrderAdaptersForConnectedCarriers(
    [yandexAdapter, cdekAdapter],
    [
      { providerKey: "yataxi", credentials: yandexCreds },
      { providerKey: "cdek", credentials: cdekCreds },
    ],
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].credentials, yandexCreds);
  assert.equal(result[1].credentials, cdekCreds);
  assert.notEqual(result[0].credentials, cdekCreds);
  assert.notEqual(result[1].credentials, yandexCreds);
});
