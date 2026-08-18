import assert from "node:assert/strict";
import test from "node:test";

import { cdekCalculatorServices } from "../packages/core/src/carrier-adapter/cdek/insurance-services.ts";

// ── type 1 «Интернет-магазин»: the fee is automatic, asking for it is refused ──

test("type 1 → nothing to send, the key is omitted", () => {
  assert.equal(cdekCalculatorServices("1", "1500"), undefined);
});

test("type 1 → omitted no matter what the declared value is", () => {
  for (const value of ["0", "1", "1500", "1000000"]) {
    assert.equal(cdekCalculatorServices("1", value), undefined);
  }
});

// ── type 2 «Доставка»: omit it and CDEK insures the parcel for one rouble ──

test("type 2 → INSURANCE with the real declared value", () => {
  assert.deepEqual(cdekCalculatorServices("2", "1500"), [
    { code: "INSURANCE", parameter: "1500" },
  ]);
});

test("type 2 → the declared value reaches parameter unchanged", () => {
  for (const value of ["1", "150", "1500.5", "1000000"]) {
    const services = cdekCalculatorServices("2", value);
    assert.equal(services?.length, 1);
    assert.equal(services?.[0].parameter, value);
    assert.equal(services?.[0].code, "INSURANCE");
  }
});

test("type 2 → parameter is NEVER the substituted 1 unless that is the real value", () => {
  // CDEK substitutes parameter 1 when the field is missing, which insures
  // nothing. Sending 1 must therefore only ever happen when 1 is the truth.
  const services = cdekCalculatorServices("2", "4200");
  assert.notEqual(services?.[0].parameter, "1");
  assert.equal(services?.[0].parameter, "4200");
});

// ── anything else behaves as type 2 ────────────────────────────────────────

for (const type of ["3", "0", "", "  ", "abc", "12", "١"]) {
  test(`unknown contract type ${JSON.stringify(type)} → behaves as type 2`, () => {
    assert.deepEqual(cdekCalculatorServices(type, "1500"), [
      { code: "INSURANCE", parameter: "1500" },
    ]);
  });
}

test("surrounding whitespace does not turn type 1 into an unknown type", () => {
  assert.equal(cdekCalculatorServices("  1  ", "1500"), undefined);
});

test("surrounding whitespace does not turn type 2 into an unknown type", () => {
  assert.deepEqual(cdekCalculatorServices(" 2 ", "1500"), [
    { code: "INSURANCE", parameter: "1500" },
  ]);
});

test("the two known types differ: exactly one of them sends the array", () => {
  const one = cdekCalculatorServices("1", "1500");
  const two = cdekCalculatorServices("2", "1500");
  assert.equal(one, undefined);
  assert.ok(Array.isArray(two));
});
