import assert from "node:assert/strict";
import test from "node:test";

import { shouldShowPostamatTooLargeNotice } from "../apps/web/lib/shipments/should-show-postamat-too-large.ts";

const oversized = {
  weightG: 25_000,
  lengthCm: 50,
  widthCm: 40,
  heightCm: 30,
};

const fitting = {
  weightG: 1000,
  lengthCm: 30,
  widthCm: 20,
  heightCm: 10,
};

test("PVZ + oversized → true", () => {
  assert.equal(
    shouldShowPostamatTooLargeNotice({ pickupType: "PVZ", ...oversized }),
    true,
  );
});

test("PVZ + fitting → false", () => {
  assert.equal(
    shouldShowPostamatTooLargeNotice({ pickupType: "PVZ", ...fitting }),
    false,
  );
});

test("COURIER + oversized → false", () => {
  assert.equal(
    shouldShowPostamatTooLargeNotice({ pickupType: "COURIER", ...oversized }),
    false,
  );
});

test("unparseable input → false", () => {
  assert.equal(
    shouldShowPostamatTooLargeNotice({
      pickupType: "PVZ",
      weightG: Number.NaN,
      lengthCm: 30,
      widthCm: 20,
      heightCm: 10,
    }),
    false,
  );
});
