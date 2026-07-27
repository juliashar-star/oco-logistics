import assert from "node:assert/strict";
import test from "node:test";

import { shouldShowOfferServiceTitle } from "../apps/web/lib/shipments/should-show-offer-service-title.ts";

test("shouldShowOfferServiceTitle: empty list → false", () => {
  assert.equal(shouldShowOfferServiceTitle([]), false);
});

test("shouldShowOfferServiceTitle: one offer → false", () => {
  assert.equal(
    shouldShowOfferServiceTitle([{ serviceTitle: "Доставка на следующий день" }]),
    false,
  );
});

test("shouldShowOfferServiceTitle: many offers, same title → false", () => {
  assert.equal(
    shouldShowOfferServiceTitle([
      { serviceTitle: "Доставка на следующий день" },
      { serviceTitle: "Доставка на следующий день" },
      { serviceTitle: "Доставка на следующий день" },
    ]),
    false,
  );
});

test("shouldShowOfferServiceTitle: two distinct non-empty titles → true", () => {
  assert.equal(
    shouldShowOfferServiceTitle([
      { serviceTitle: "Доставка на следующий день" },
      { serviceTitle: "Экспресс" },
    ]),
    true,
  );
});

test("shouldShowOfferServiceTitle: blank titles do not count toward distinct", () => {
  assert.equal(
    shouldShowOfferServiceTitle([
      { serviceTitle: "Экспресс" },
      { serviceTitle: "" },
      { serviceTitle: "  " },
    ]),
    false,
  );
  assert.equal(
    shouldShowOfferServiceTitle([
      { serviceTitle: "Экспресс" },
      { serviceTitle: "" },
      { serviceTitle: "Доставка на следующий день" },
    ]),
    true,
  );
});
