import assert from "node:assert/strict";
import test from "node:test";

import { composeExpressRouteFullname } from "../packages/core/src/carrier-adapter/yandex/express-client.ts";

test("composeExpressRouteFullname prepends city when address has no city", () => {
  assert.equal(
    composeExpressRouteFullname("Москва", "ул Складская, 1"),
    "Москва, ул Складская, 1",
  );
});

test("composeExpressRouteFullname does not double the city when address equals city", () => {
  assert.equal(composeExpressRouteFullname("Москва", "Москва"), "Москва");
});

test("composeExpressRouteFullname keeps address that already starts with the city", () => {
  const full = "Москва, ул Тверская, д 1";
  assert.equal(composeExpressRouteFullname("Москва", full), full);
});

test("composeExpressRouteFullname falls back to city alone when addressString absent", () => {
  assert.equal(composeExpressRouteFullname("Москва", undefined), "Москва");
  assert.equal(composeExpressRouteFullname("Москва", null), "Москва");
  assert.equal(composeExpressRouteFullname("Москва", "  "), "Москва");
});

test("composeExpressRouteFullname is case-insensitive for the city prefix check", () => {
  assert.equal(
    composeExpressRouteFullname("Москва", "москва, ул Тверская"),
    "москва, ул Тверская",
  );
});
