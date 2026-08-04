import assert from "node:assert/strict";
import test from "node:test";

import { describePartialPickupPoints } from "../apps/web/lib/shipments/describe-partial-pickup-points.ts";

test("all ok → null", () => {
  assert.equal(
    describePartialPickupPoints([
      { providerKey: "yataxi", status: "ok", carrierName: "Перевозчик №1" },
      { providerKey: "cdek", status: "ok", carrierName: "Перевозчик №2" },
    ]),
    null,
  );
});

test("empty carriers array → null", () => {
  assert.equal(describePartialPickupPoints([]), null);
  assert.equal(describePartialPickupPoints(undefined), null);
});

test("ok with zero points is ignored (not a partial failure)", () => {
  assert.equal(
    describePartialPickupPoints([
      { providerKey: "yataxi", status: "ok", carrierName: "Перевозчик №1" },
    ]),
    null,
  );
});

test("one failed among two ok", () => {
  assert.equal(
    describePartialPickupPoints([
      { providerKey: "yataxi", status: "ok", carrierName: "Перевозчик №1" },
      { providerKey: "cdek", status: "failed", carrierName: "Перевозчик №2" },
      {
        providerKey: "other",
        status: "ok",
        carrierName: "Перевозчик №3",
      },
    ]),
    "Не удалось загрузить пункты: Перевозчик №2",
  );
});

test("city_not_resolved", () => {
  assert.equal(
    describePartialPickupPoints([
      {
        providerKey: "cdek",
        status: "city_not_resolved",
        carrierName: "Перевозчик №2",
      },
      { providerKey: "yataxi", status: "ok", carrierName: "Перевозчик №1" },
    ]),
    "Перевозчик №2 не нашёл этот город",
  );
});

test("no_adapter", () => {
  assert.equal(
    describePartialPickupPoints([
      { providerKey: "cdek", status: "no_adapter", carrierName: "Перевозчик №2" },
      { providerKey: "yataxi", status: "ok", carrierName: "Перевозчик №1" },
    ]),
    "Для Перевозчика №2 список пунктов пока недоступен",
  );
});

test("two different statuses at once → both groups, joined", () => {
  assert.equal(
    describePartialPickupPoints([
      { providerKey: "yataxi", status: "ok", carrierName: "Перевозчик №1" },
      { providerKey: "cdek", status: "failed", carrierName: "Перевозчик №2" },
      {
        providerKey: "alpha",
        status: "no_adapter",
        carrierName: "Перевозчик №3",
      },
    ]),
    "Не удалось загрузить пункты: Перевозчик №2; Для Перевозчика №3 список пунктов пока недоступен",
  );
});

test("provider error / message text never reaches the string", () => {
  const providerMessage =
    "PROVIDER_ERR_TEXT_should_never_leak: connection refused upstream";
  const result = describePartialPickupPoints([
    {
      providerKey: "cdek",
      status: "failed",
      carrierName: "Перевозчик №2",
      message: providerMessage,
      error: providerMessage,
      providerMessage,
    },
  ]);
  assert.equal(result, "Не удалось загрузить пункты: Перевозчик №2");
  assert.equal(result.includes(providerMessage), false);
  assert.equal(result.includes("connection refused"), false);
  assert.equal(result.includes("PROVIDER_ERR_TEXT"), false);
});

test("empty carrierName → neither providerKey nor key-like token", () => {
  const providerKey = "yataxi_secret_key_xyz99";
  const result = describePartialPickupPoints([
    {
      providerKey,
      status: "failed",
      carrierName: "",
    },
  ]);
  assert.ok(result);
  assert.equal(result.includes(providerKey), false);
  assert.equal(result.includes("yataxi"), false);
  assert.equal(result.includes("secret_key"), false);
  assert.equal(result.includes("_xyz"), false);
  assert.equal(result, "Не удалось загрузить пункты: один из перевозчиков");
});

test("empty carrierName: city_not_resolved and no_adapter use nominative / genitive slots", () => {
  assert.equal(
    describePartialPickupPoints([
      {
        providerKey: "alpha_key_zzz",
        status: "city_not_resolved",
        carrierName: "",
      },
    ]),
    "Один из перевозчиков не нашёл этот город",
  );
  assert.equal(
    describePartialPickupPoints([
      {
        providerKey: "beta_key_zzz",
        status: "no_adapter",
        carrierName: "",
      },
    ]),
    "Для одного из перевозчиков список пунктов пока недоступен",
  );
});
