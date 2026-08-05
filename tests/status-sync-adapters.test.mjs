import assert from "node:assert/strict";
import test from "node:test";

import {
  getOrderHistory as cdekGetOrderHistory,
  getOrderInfo as cdekGetOrderInfo,
} from "../packages/core/src/carrier-adapter/cdek/client.ts";
import { mapCdekStatusToShipmentStatus } from "../packages/core/src/carrier-adapter/cdek/map-status.ts";
import { STATUS_SYNC_ADAPTERS } from "../packages/core/src/carrier-adapter/status-sync-adapters.ts";

test("registry has the expected set of keys", () => {
  assert.deepEqual(Object.keys(STATUS_SYNC_ADAPTERS).sort(), [
    "cdek:delivery",
    "yataxi:courier",
    "yataxi:express",
    "yataxi:next_day",
  ]);
});

test("cdek:delivery entry uses ORDER_ADAPTERS key/providerKey and same function references", () => {
  const entry = STATUS_SYNC_ADAPTERS["cdek:delivery"];
  assert.ok(entry);
  assert.equal(entry.orderAdapterKey, "cdek:delivery");
  assert.equal(entry.providerKey, "cdek");
  assert.equal(entry.getOrderHistory, cdekGetOrderHistory);
  assert.equal(entry.getOrderInfo, cdekGetOrderInfo);
  assert.equal(entry.mapStatus, mapCdekStatusToShipmentStatus);
});
