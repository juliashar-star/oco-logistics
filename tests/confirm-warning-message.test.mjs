import assert from "node:assert/strict";
import test from "node:test";

import { confirmWarningMessage } from "../apps/web/lib/shipments/confirm-warning-message.ts";

const CODES = [
  "REQUIREMENT_UNMET",
  "PARCEL_MAY_NOT_FIT",
  "ADDRESS_NOT_FOUND",
  "ADDRESS_COORDINATE_MISMATCH",
  "UNKNOWN",
];

test("every neutral code has non-empty Russian wording", () => {
  for (const code of CODES) {
    const text = confirmWarningMessage(code);
    assert.equal(typeof text, "string");
    assert.ok(text.length > 10, code);
  }
});

test("address codes urge checking while the parcel is still with the seller", () => {
  for (const code of ["ADDRESS_NOT_FOUND", "ADDRESS_COORDINATE_MISMATCH"]) {
    const text = confirmWarningMessage(code);
    assert.match(text, /пока посылка ещё у вас/);
    assert.match(text, /Проверьте адрес/);
  }
});

test("requirement unmet states the order was created without the requirement", () => {
  assert.match(
    confirmWarningMessage("REQUIREMENT_UNMET"),
    /заказ создан без него/,
  );
});

test("wording never embeds a sample provider message fragment", () => {
  for (const code of CODES) {
    const text = confirmWarningMessage(code);
    assert.doesNotMatch(text, /requirement_unavailable|not_fit_in_car/);
    assert.doesNotMatch(text, /указанное требование недоступно/);
  }
});
