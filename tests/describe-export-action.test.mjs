import assert from "node:assert/strict";
import test from "node:test";

import { exportActionLabel } from "../apps/web/lib/shipments/describe-export-action.ts";

test("nothing selected → the filter-wide label, unchanged from before", () => {
  assert.equal(exportActionLabel(0), "Экспорт CSV");
});

test("one selected → names the selection and the count, without agreeing with it", () => {
  assert.equal(exportActionLabel(1), "Экспорт выбранных: 1");
});

test("several selected → same shape, number last", () => {
  assert.equal(exportActionLabel(5), "Экспорт выбранных: 5");
  assert.equal(exportActionLabel(22), "Экспорт выбранных: 22");
});

test("a negative count cannot produce a selection label", () => {
  assert.equal(exportActionLabel(-1), "Экспорт CSV");
});
