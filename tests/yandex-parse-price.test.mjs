import assert from "node:assert/strict";
import test from "node:test";

import { parseRublePrice } from "../packages/core/src/carrier-adapter/yandex/parse-price.ts";

test("parseRublePrice parses decimal amounts", () => {
  assert.equal(parseRublePrice("374.54 RUB"), 374.54);
  assert.equal(parseRublePrice("203.74 RUB"), 203.74);
});

test("parseRublePrice parses zero and whole ruble amounts", () => {
  assert.equal(parseRublePrice("0 RUB"), 0);
  assert.equal(parseRublePrice("100 RUB"), 100);
});

test("parseRublePrice throws on malformed input", () => {
  for (const raw of ["374.54", "RUB 374.54", "abc RUB", ""]) {
    assert.throws(() => parseRublePrice(raw), /Unrecognized price format from Yandex Delivery/);
  }
});
