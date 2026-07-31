import assert from "node:assert/strict";
import test from "node:test";

import {
  PARCEL_ENTRY_MAX_SIDE_CM,
  PARCEL_ENTRY_MAX_WEIGHT_G,
  PARCEL_ENTRY_SIDE_TOO_LARGE,
  PARCEL_ENTRY_WEIGHT_TOO_LARGE,
  formatParcelEntrySummary,
  parcelEntryCeilingError,
} from "../apps/web/lib/shipments/format-parcel-entry-summary.ts";

test("empty or unparseable → null, never NaN", () => {
  assert.equal(formatParcelEntrySummary("", 30, 20, 10), null);
  assert.equal(formatParcelEntrySummary("  ", "30", "20", "10"), null);
  assert.equal(formatParcelEntrySummary("abc", 30, 20, 10), null);
  assert.equal(formatParcelEntrySummary(1000, "", 20, 10), null);
  assert.equal(formatParcelEntrySummary(1000, 30, "x", 10), null);
  assert.equal(formatParcelEntrySummary(1000, 30, 20, Number.NaN), null);
  assert.equal(formatParcelEntrySummary(Number.POSITIVE_INFINITY, 30, 20, 10), null);
});

test("formats kilograms from 20 g to 100 kg with ru-RU decimals", () => {
  assert.equal(
    formatParcelEntrySummary(20, 30, 20, 10),
    "0,02 кг · сумма сторон 60 см",
  );
  assert.equal(
    formatParcelEntrySummary(1000, 30, 20, 10),
    "1 кг · сумма сторон 60 см",
  );
  assert.equal(
    formatParcelEntrySummary(1500, 40, 30, 20),
    "1,5 кг · сумма сторон 90 см",
  );
  assert.equal(
    formatParcelEntrySummary(20000, 50, 40, 30),
    "20 кг · сумма сторон 120 см",
  );
  assert.equal(
    formatParcelEntrySummary(100_000, 60, 60, 60),
    "100 кг · сумма сторон 180 см",
  );
});

test("accepts string inputs from the form as they type", () => {
  assert.equal(
    formatParcelEntrySummary("2000", "30", "20", "10"),
    "2 кг · сумма сторон 60 см",
  );
});

test("ceiling: weight and each side — messages put the number after the noun", () => {
  assert.equal(PARCEL_ENTRY_MAX_WEIGHT_G, 100_000);
  assert.equal(PARCEL_ENTRY_MAX_SIDE_CM, 200);
  assert.equal(
    parcelEntryCeilingError(100_001, 1, 1, 1),
    PARCEL_ENTRY_WEIGHT_TOO_LARGE,
  );
  assert.equal(parcelEntryCeilingError(100_000, 1, 1, 1), null);
  assert.equal(
    parcelEntryCeilingError(1000, 201, 1, 1),
    PARCEL_ENTRY_SIDE_TOO_LARGE,
  );
  assert.equal(
    parcelEntryCeilingError(1000, 1, 201, 1),
    PARCEL_ENTRY_SIDE_TOO_LARGE,
  );
  assert.equal(
    parcelEntryCeilingError(1000, 1, 1, 201),
    PARCEL_ENTRY_SIDE_TOO_LARGE,
  );
  assert.equal(parcelEntryCeilingError(1000, 200, 200, 200), null);
  assert.equal(PARCEL_ENTRY_WEIGHT_TOO_LARGE, "Вес — не больше 100 кг");
  assert.equal(PARCEL_ENTRY_SIDE_TOO_LARGE, "Каждая сторона — не больше 200 см");
});
