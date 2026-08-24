import assert from "node:assert/strict";
import test from "node:test";

import { splitSelectionForDelete } from "../apps/web/lib/shipments/split-selection-for-delete.ts";

const draft = (id) => ({ id, status: "DRAFT", hasCarrierOrder: false });
const created = (id) => ({ id, status: "CREATED", hasCarrierOrder: true });

test("empty selection splits into nothing", () => {
  assert.deepEqual(splitSelectionForDelete([draft("a")], new Set()), {
    deletable: [],
    kept: [],
  });
});

test("only drafts selected → everything is deletable", () => {
  const rows = [draft("a"), draft("b")];
  assert.deepEqual(splitSelectionForDelete(rows, new Set(["a", "b"])), {
    deletable: ["a", "b"],
    kept: [],
  });
});

test("only non-drafts selected → nothing is deletable", () => {
  const rows = [created("a"), created("b")];
  assert.deepEqual(splitSelectionForDelete(rows, new Set(["a", "b"])), {
    deletable: [],
    kept: ["a", "b"],
  });
});

test("mixed selection splits both ways", () => {
  const rows = [draft("a"), created("b"), draft("c")];
  assert.deepEqual(splitSelectionForDelete(rows, new Set(["a", "b", "c"])), {
    deletable: ["a", "c"],
    kept: ["b"],
  });
});

test("unselected rows are ignored entirely", () => {
  const rows = [draft("a"), draft("b"), created("c")];
  assert.deepEqual(splitSelectionForDelete(rows, new Set(["a"])), {
    deletable: ["a"],
    kept: [],
  });
});

test("a DRAFT that already has a carrier order is KEPT, mirroring the server guard", () => {
  const rows = [{ id: "a", status: "DRAFT", hasCarrierOrder: true }];
  assert.deepEqual(splitSelectionForDelete(rows, new Set(["a"])), {
    deletable: [],
    kept: ["a"],
  });
});

test("a selected id that is not on the page contributes to neither side", () => {
  const rows = [draft("a")];
  assert.deepEqual(splitSelectionForDelete(rows, new Set(["a", "gone"])), {
    deletable: ["a"],
    kept: [],
  });
});

test("row order is preserved within each side", () => {
  const rows = [draft("c"), draft("a"), draft("b")];
  assert.deepEqual(
    splitSelectionForDelete(rows, new Set(["a", "b", "c"])).deletable,
    ["c", "a", "b"],
  );
});
