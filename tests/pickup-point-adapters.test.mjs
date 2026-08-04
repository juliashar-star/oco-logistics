import assert from "node:assert/strict";
import test from "node:test";

import {
  getPickupPointAdapter,
  PICKUP_POINT_ADAPTERS,
} from "../packages/core/src/carrier-adapter/pickup-point-adapters.ts";
import { listPickupPoints as cdekListPickupPoints } from "../packages/core/src/carrier-adapter/cdek/client.ts";
import { listPickupPoints as yandexListPickupPoints } from "../packages/core/src/carrier-adapter/yandex/client.ts";

test("known providerKey resolves and providerKey matches", () => {
  const adapter = getPickupPointAdapter("yataxi");
  assert.ok(adapter);
  assert.equal(adapter.providerKey, "yataxi");
  assert.equal(PICKUP_POINT_ADAPTERS.yataxi.providerKey, "yataxi");
});

test("unknown providerKey returns undefined", () => {
  assert.equal(getPickupPointAdapter("unknown-carrier"), undefined);
  assert.equal(getPickupPointAdapter(""), undefined);
});

test("registered listPickupPoints is the same function reference as Yandex export", () => {
  const adapter = getPickupPointAdapter("yataxi");
  assert.ok(adapter);
  assert.equal(adapter.listPickupPoints, yandexListPickupPoints);
  assert.equal(
    PICKUP_POINT_ADAPTERS.yataxi.listPickupPoints,
    yandexListPickupPoints,
  );
});

test("registry has both yataxi and cdek entries", () => {
  assert.deepEqual(Object.keys(PICKUP_POINT_ADAPTERS).sort(), [
    "cdek",
    "yataxi",
  ]);

  const yandex = getPickupPointAdapter("yataxi");
  const cdek = getPickupPointAdapter("cdek");
  assert.ok(yandex);
  assert.ok(cdek);
  assert.equal(yandex.providerKey, "yataxi");
  assert.equal(cdek.providerKey, "cdek");
  assert.equal(cdek.listPickupPoints, cdekListPickupPoints);
  assert.equal(
    PICKUP_POINT_ADAPTERS.cdek.listPickupPoints,
    cdekListPickupPoints,
  );
});
