import assert from "node:assert/strict";
import test from "node:test";

import { buildCarrierIntegrationRequestSellerConfirmationPlaintext } from "../packages/core/lib/email.ts";
import { providerSellerDisplayName } from "../packages/core/src/carrier-adapter/provider-seller-display-names.ts";
import { CARRIER_REGISTRY } from "../packages/core/src/carrier-picker/registry.ts";

test("seller confirmation body uses masked yataxi name and omits the real carrier name", () => {
  const realName = CARRIER_REGISTRY.find((c) => c.providerKey === "yataxi")?.displayName;
  assert.equal(realName, "Яндекс Доставка");

  const masked = providerSellerDisplayName("yataxi");
  assert.equal(masked, "Перевозчик №1");

  const body = buildCarrierIntegrationRequestSellerConfirmationPlaintext(
    masked,
    "25.07.2026",
  );

  assert.match(body, /Перевозчик №1/);
  assert.equal(body.includes(realName), false);
  assert.equal(body.includes("Яндекс Доставка"), false);
});
