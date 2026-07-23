import assert from "node:assert/strict";
import test from "node:test";

import { describeEmptyPickupPoints } from "../apps/web/lib/shipments/describe-empty-pickup-points.ts";

test("not an array or empty → no connected carriers", () => {
  assert.equal(
    describeEmptyPickupPoints(undefined),
    "Не подключён ни один перевозчик — подключите перевозчика в настройках",
  );
  assert.equal(
    describeEmptyPickupPoints([]),
    "Не подключён ни один перевозчик — подключите перевозчика в настройках",
  );
});

test("any failed → carrier outage wording", () => {
  assert.equal(
    describeEmptyPickupPoints([{ providerKey: "yataxi", status: "failed" }]),
    "Не удалось получить пункты выдачи от перевозчика. Попробуйте позже",
  );
});

test("ok with resolvedLocation.address → city named, no PVZ", () => {
  assert.equal(
    describeEmptyPickupPoints([
      {
        providerKey: "yataxi",
        status: "ok",
        resolvedLocation: { id: "geo-1", address: "Казань" },
      },
    ]),
    "В городе «Казань» пунктов выдачи не найдено",
  );
});

test("city_not_resolved → check the name", () => {
  assert.equal(
    describeEmptyPickupPoints([
      { providerKey: "yataxi", status: "city_not_resolved" },
    ]),
    "Не удалось распознать город — проверьте название",
  );
});

test("every entry no_adapter → PVZ list unavailable", () => {
  assert.equal(
    describeEmptyPickupPoints([
      { providerKey: "alpha", status: "no_adapter" },
      { providerKey: "beta", status: "no_adapter" },
    ]),
    "Для подключённого перевозчика список ПВЗ пока недоступен",
  );
});

test("fallback anything else → generic empty", () => {
  assert.equal(
    describeEmptyPickupPoints([{ providerKey: "yataxi", status: "ok" }]),
    "Не найдено пунктов выдачи в этом городе",
  );
});

test("mixed: failed outranks ok with resolvedLocation", () => {
  assert.equal(
    describeEmptyPickupPoints([
      {
        providerKey: "alpha",
        status: "ok",
        resolvedLocation: { id: "geo-a", address: "Москва" },
      },
      { providerKey: "beta", status: "failed" },
    ]),
    "Не удалось получить пункты выдачи от перевозчика. Попробуйте позже",
  );
});
