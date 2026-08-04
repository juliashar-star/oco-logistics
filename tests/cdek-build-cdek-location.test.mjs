import assert from "node:assert/strict";
import test from "node:test";

import { buildCdekLocation } from "../packages/core/src/carrier-adapter/cdek/build-cdek-location.ts";

test("street address passes through trimmed", () => {
  assert.deepEqual(buildCdekLocation("Москва", "  ул. Тверская, д. 1  "), {
    city: "Москва",
    address: "ул. Тверская, д. 1",
  });
});

test("null / undefined / empty / whitespace-only address fall back to city", () => {
  assert.deepEqual(buildCdekLocation("Москва", null), {
    city: "Москва",
    address: "Москва",
  });
  assert.deepEqual(buildCdekLocation("Москва", undefined), {
    city: "Москва",
    address: "Москва",
  });
  assert.deepEqual(buildCdekLocation("Москва", ""), {
    city: "Москва",
    address: "Москва",
  });
  assert.deepEqual(buildCdekLocation("Москва", "   "), {
    city: "Москва",
    address: "Москва",
  });
});

test("city itself is trimmed", () => {
  assert.deepEqual(buildCdekLocation("  Москва  ", undefined), {
    city: "Москва",
    address: "Москва",
  });
  assert.deepEqual(buildCdekLocation("  Москва  ", "  ул. Ленина, 1  "), {
    city: "Москва",
    address: "ул. Ленина, 1",
  });
});
