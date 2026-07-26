import assert from "node:assert/strict";
import test from "node:test";

import {
  PROVIDER_SELLER_DISPLAY_NAMES,
  providerSellerDisplayName,
} from "../packages/core/src/carrier-adapter/provider-seller-display-names.ts";
import { CARRIER_REGISTRY } from "../packages/core/src/carrier-picker/registry.ts";

test("providerSellerDisplayName masks yataxi", () => {
  assert.equal(providerSellerDisplayName("yataxi"), "Перевозчик №1");
});

test("providerSellerDisplayName falls back to registry displayName when map has no entry", () => {
  assert.equal(PROVIDER_SELLER_DISPLAY_NAMES.cdek, undefined);
  const cdek = CARRIER_REGISTRY.find((c) => c.providerKey === "cdek");
  assert.ok(cdek);
  assert.equal(providerSellerDisplayName("cdek"), cdek.displayName);
  assert.equal(providerSellerDisplayName("cdek"), "СДЭК");
});
