import assert from "node:assert/strict";
import test from "node:test";

import { narrowAdaptersToPointCarrier } from "../packages/core/src/carrier-adapter/narrow-adapters-to-point-carrier.ts";

/** @typedef {import("../packages/core/src/carrier-adapter/order-adapters.ts").OrderAdapter} OrderAdapter */
/** @typedef {import("../packages/core/src/carrier-adapter/select-order-adapters-for-connected-carriers.ts").SelectedOrderAdapter} SelectedOrderAdapter */

/**
 * @param {string} key
 * @param {string} providerKey
 * @returns {SelectedOrderAdapter}
 */
function selected(key, providerKey) {
  return {
    adapter: {
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
    },
    credentials: { token: `${providerKey}-token` },
  };
}

test("null pvzProviderKey passes every adapter through unchanged (legacy drafts)", () => {
  const input = [
    selected("yataxi:next_day", "yataxi"),
    selected("cdek:warehouse", "cdek"),
  ];
  const result = narrowAdaptersToPointCarrier(input, null);
  assert.equal(result, input);
  assert.equal(result.length, 2);
});

test("empty string pvzProviderKey passes every adapter through unchanged (legacy drafts)", () => {
  const input = [
    selected("yataxi:next_day", "yataxi"),
    selected("cdek:warehouse", "cdek"),
  ];
  const result = narrowAdaptersToPointCarrier(input, "");
  assert.equal(result, input);
  assert.equal(result.length, 2);
});

test("whitespace-only pvzProviderKey passes every adapter through unchanged", () => {
  const input = [selected("yataxi:next_day", "yataxi")];
  const result = narrowAdaptersToPointCarrier(input, "   ");
  assert.equal(result, input);
});

test("a key keeps only adapters for that carrier", () => {
  const yandex = selected("yataxi:next_day", "yataxi");
  const cdek = selected("cdek:warehouse", "cdek");
  const result = narrowAdaptersToPointCarrier([yandex, cdek], "cdek");
  assert.deepEqual(result, [cdek]);
});

test("a key matching nothing returns an empty array", () => {
  const input = [
    selected("yataxi:next_day", "yataxi"),
    selected("cdek:warehouse", "cdek"),
  ];
  const result = narrowAdaptersToPointCarrier(input, "alpha");
  assert.deepEqual(result, []);
});

test("input array is not mutated", () => {
  const yandex = selected("yataxi:next_day", "yataxi");
  const cdek = selected("cdek:warehouse", "cdek");
  const input = [yandex, cdek];
  narrowAdaptersToPointCarrier(input, "yataxi");
  assert.equal(input.length, 2);
  assert.equal(input[0], yandex);
  assert.equal(input[1], cdek);
});
