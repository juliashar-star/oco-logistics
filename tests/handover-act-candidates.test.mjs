import assert from "node:assert/strict";
import test from "node:test";

import { handoverActCandidates } from "../apps/web/lib/shipments/handover-act-candidates.ts";

test("CREATED is a checked candidate", () => {
  const row = { id: "a", status: "CREATED", providerKey: "yataxi" };
  assert.deepEqual(handoverActCandidates([row]), [
    { row, initiallyChecked: true },
  ]);
});

test("IN_TRANSIT is an unchecked candidate", () => {
  const row = { id: "b", status: "IN_TRANSIT", providerKey: "yataxi" };
  assert.deepEqual(handoverActCandidates([row]), [
    { row, initiallyChecked: false },
  ]);
});

test("CANCELED, DELIVERED, DRAFT and SUBMITTING are not candidates", () => {
  assert.deepEqual(
    handoverActCandidates([
      { id: "1", status: "CANCELED", providerKey: "yataxi" },
      { id: "2", status: "DELIVERED", providerKey: "yataxi" },
      { id: "3", status: "DRAFT", providerKey: null },
      { id: "4", status: "SUBMITTING", providerKey: null },
    ]),
    [],
  );
});

test("mixed list keeps input order with the right flags", () => {
  const created = { id: "c", status: "CREATED", providerKey: "yataxi" };
  const canceled = { id: "x", status: "CANCELED", providerKey: "yataxi" };
  const inTransit = { id: "i", status: "IN_TRANSIT", providerKey: "yataxi" };
  const delivered = { id: "d", status: "DELIVERED", providerKey: "yataxi" };
  assert.deepEqual(
    handoverActCandidates([created, canceled, inTransit, delivered]),
    [
      { row: created, initiallyChecked: true },
      { row: inTransit, initiallyChecked: false },
    ],
  );
});

test("empty list returns empty", () => {
  assert.deepEqual(handoverActCandidates([]), []);
});

test("CREATED with providerKey null is not a candidate", () => {
  assert.deepEqual(
    handoverActCandidates([
      { id: "legacy", status: "CREATED", providerKey: null },
    ]),
    [],
  );
});

test("CREATED with a providerKey is a checked candidate", () => {
  const row = { id: "ok", status: "CREATED", providerKey: "yataxi" };
  assert.deepEqual(handoverActCandidates([row]), [
    { row, initiallyChecked: true },
  ]);
});

test("IN_TRANSIT with providerKey null is not a candidate", () => {
  assert.deepEqual(
    handoverActCandidates([
      { id: "stale", status: "IN_TRANSIT", providerKey: null },
    ]),
    [],
  );
});

test("IN_TRANSIT with a providerKey is an unchecked candidate", () => {
  const row = { id: "moving", status: "IN_TRANSIT", providerKey: "yataxi" };
  assert.deepEqual(handoverActCandidates([row]), [
    { row, initiallyChecked: false },
  ]);
});
