import assert from "node:assert/strict";
import test from "node:test";

import { shouldShowOfferLacksThermalBag } from "../apps/web/lib/shipments/should-show-offer-lacks-thermal-bag.ts";

test("true only when bag requested and service does not support it", () => {
  assert.equal(
    shouldShowOfferLacksThermalBag({
      needsThermalBag: true,
      supportsThermalBag: false,
    }),
    true,
  );
});

test("false when bag requested and service supports it", () => {
  assert.equal(
    shouldShowOfferLacksThermalBag({
      needsThermalBag: true,
      supportsThermalBag: true,
    }),
    false,
  );
});

test("false when bag not requested and service does not support it", () => {
  assert.equal(
    shouldShowOfferLacksThermalBag({
      needsThermalBag: false,
      supportsThermalBag: false,
    }),
    false,
  );
});

test("false when bag not requested and service supports it", () => {
  assert.equal(
    shouldShowOfferLacksThermalBag({
      needsThermalBag: false,
      supportsThermalBag: true,
    }),
    false,
  );
});
