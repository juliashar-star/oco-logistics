import assert from "node:assert/strict";
import test from "node:test";

import { parseClaimWarnings } from "../packages/core/src/carrier-adapter/yandex/parse-claim-warnings.ts";

test("absent warnings → empty list", () => {
  assert.deepEqual(parseClaimWarnings(undefined), []);
  assert.deepEqual(parseClaimWarnings(null), []);
});

test("empty array → empty list", () => {
  assert.deepEqual(parseClaimWarnings([]), []);
});

test("each of the four documented codes maps to a neutral value", () => {
  assert.deepEqual(
    parseClaimWarnings([
      { source: "client_requirements", code: "requirement_unavailable", message: "echo" },
    ]),
    ["REQUIREMENT_UNMET"],
  );
  assert.deepEqual(
    parseClaimWarnings([
      { source: "client_requirements", code: "not_fit_in_car", message: "echo" },
    ]),
    ["PARCEL_MAY_NOT_FIT"],
  );
  assert.deepEqual(
    parseClaimWarnings([
      { source: "route_points", code: "address_not_found", message: "ул Тверская" },
    ]),
    ["ADDRESS_NOT_FOUND"],
  );
  assert.deepEqual(
    parseClaimWarnings([
      { source: "route_points", code: "address_too_far", message: "coords" },
    ]),
    ["ADDRESS_COORDINATE_MISMATCH"],
  );
});

test("unknown code → UNKNOWN (not dropped)", () => {
  assert.deepEqual(
    parseClaimWarnings([
      { source: "client_requirements", code: "future_code_xyz", message: "x" },
    ]),
    ["UNKNOWN"],
  );
});

test("non-array → empty list (never throws)", () => {
  assert.deepEqual(parseClaimWarnings("not-an-array"), []);
  assert.deepEqual(parseClaimWarnings({ code: "not_fit_in_car" }), []);
  assert.deepEqual(parseClaimWarnings(42), []);
});

test("entry with no code is skipped (never throws)", () => {
  assert.deepEqual(
    parseClaimWarnings([
      { source: "client_requirements", message: "no code here" },
      { code: null, message: "null code" },
      { code: "", message: "empty" },
      "bare-string",
      null,
    ]),
    [],
  );
});

test("several warnings at once preserve order and map each", () => {
  assert.deepEqual(
    parseClaimWarnings([
      { code: "address_not_found", message: "a" },
      { code: "requirement_unavailable", message: "b" },
      { code: "brand_new_code", message: "c" },
      { message: "skipped" },
      { code: "not_fit_in_car", message: "d" },
    ]),
    [
      "ADDRESS_NOT_FOUND",
      "REQUIREMENT_UNMET",
      "UNKNOWN",
      "PARCEL_MAY_NOT_FIT",
    ],
  );
});

test("never depends on message — same code same result with any message", () => {
  const a = parseClaimWarnings([
    { code: "requirement_unavailable", message: "+79001234567 Иванов" },
  ]);
  const b = parseClaimWarnings([{ code: "requirement_unavailable" }]);
  assert.deepEqual(a, b);
  assert.deepEqual(a, ["REQUIREMENT_UNMET"]);
});
