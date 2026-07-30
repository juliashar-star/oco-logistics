import assert from "node:assert/strict";
import test from "node:test";

import { matchPickupPointOptionLabel } from "../apps/web/lib/shipments/match-pickup-point-option-label.ts";

const LABEL = "Постамат — Лучше чем МП — ул. Арбат, 10";

test("empty query matches everything", () => {
  assert.equal(matchPickupPointOptionLabel(LABEL, ""), true);
});

test("whitespace-only query matches everything", () => {
  assert.equal(matchPickupPointOptionLabel(LABEL, "   \t  "), true);
});

test("single token present in label", () => {
  assert.equal(matchPickupPointOptionLabel(LABEL, "арбат"), true);
});

test("two tokens in different order from the label", () => {
  assert.equal(matchPickupPointOptionLabel(LABEL, "арбат 10"), true);
  assert.equal(matchPickupPointOptionLabel(LABEL, "10 арбат"), true);
});

test("token that matches nothing", () => {
  assert.equal(matchPickupPointOptionLabel(LABEL, "тверская"), false);
});

test("case differences are ignored", () => {
  assert.equal(matchPickupPointOptionLabel(LABEL, "АРБАТ"), true);
  assert.equal(matchPickupPointOptionLabel(LABEL, "Постамат"), true);
});

test("ё typed where the label has е", () => {
  assert.equal(
    matchPickupPointOptionLabel("Пункт на Зеленой — адрес", "зелёной"),
    true,
  );
});

test("е typed where the label has ё", () => {
  assert.equal(
    matchPickupPointOptionLabel("Пункт на Зелёной — адрес", "зеленой"),
    true,
  );
});

test("extra internal whitespace is ignored", () => {
  assert.equal(matchPickupPointOptionLabel(LABEL, "  арбат    10  "), true);
});
