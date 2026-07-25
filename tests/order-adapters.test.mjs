import assert from "node:assert/strict";
import test from "node:test";

import { ORDER_ADAPTERS } from "../packages/core/src/carrier-adapter/order-adapters.ts";

test("every ORDER_ADAPTERS key starts with its entry's providerKey and a colon", () => {
  for (const [key, entry] of Object.entries(ORDER_ADAPTERS)) {
    assert.ok(
      key.startsWith(`${entry.providerKey}:`),
      `key ${JSON.stringify(key)} must start with ${JSON.stringify(entry.providerKey + ":")}`,
    );
  }
});

test("yataxi:next_day has seller-facing service title", () => {
  assert.equal(
    ORDER_ADAPTERS["yataxi:next_day"].title,
    "Доставка на следующий день",
  );
});
