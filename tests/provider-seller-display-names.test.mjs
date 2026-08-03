import assert from "node:assert/strict";
import test from "node:test";

import {
  PROVIDER_SELLER_DISPLAY_NAMES,
  providerSellerDisplayName,
} from "../packages/core/src/carrier-adapter/provider-seller-display-names.ts";
import { CARRIER_REGISTRY } from "../packages/core/src/carrier-picker/registry.ts";

test("providerSellerDisplayName masks yataxi and cdek", () => {
  assert.equal(providerSellerDisplayName("yataxi"), "Перевозчик №1");
  assert.equal(providerSellerDisplayName("cdek"), "Перевозчик №2");
});

test("providerSellerDisplayName falls back to registry displayName when map has no entry", () => {
  assert.equal(PROVIDER_SELLER_DISPLAY_NAMES.rupost, undefined);
  const rupost = CARRIER_REGISTRY.find((c) => c.providerKey === "rupost");
  assert.ok(rupost);
  assert.equal(providerSellerDisplayName("rupost"), rupost.displayName);
});
