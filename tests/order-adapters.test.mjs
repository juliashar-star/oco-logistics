import assert from "node:assert/strict";
import test from "node:test";

import { ORDER_ADAPTERS } from "../packages/core/src/carrier-adapter/order-adapters.ts";
import { ORDER_ADAPTER_SELLER_TITLES } from "../packages/core/src/carrier-adapter/order-adapter-seller-titles.ts";
import { confirmExpressOffer } from "../packages/core/src/carrier-adapter/yandex/express-client.ts";

test("every ORDER_ADAPTERS key starts with its entry's providerKey and a colon", () => {
  for (const [key, entry] of Object.entries(ORDER_ADAPTERS)) {
    assert.ok(
      key.startsWith(`${entry.providerKey}:`),
      `key ${JSON.stringify(key)} must start with ${JSON.stringify(entry.providerKey + ":")}`,
    );
  }
});

test("ORDER_ADAPTERS.title comes from ORDER_ADAPTER_SELLER_TITLES (no drift)", () => {
  for (const [key, entry] of Object.entries(ORDER_ADAPTERS)) {
    assert.equal(
      entry.title,
      ORDER_ADAPTER_SELLER_TITLES[key],
      `title for ${key} must match ORDER_ADAPTER_SELLER_TITLES`,
    );
  }
});

test("yataxi:next_day has seller-facing service title", () => {
  assert.equal(
    ORDER_ADAPTERS["yataxi:next_day"].title,
    "Доставка на следующий день",
  );
});

test("ORDER_ADAPTERS holds next_day and express with distinct titles; express confirm is wired, cancel stays stub", async () => {
  assert.ok(ORDER_ADAPTERS["yataxi:next_day"]);
  assert.ok(ORDER_ADAPTERS["yataxi:express"]);
  const nextTitle = ORDER_ADAPTERS["yataxi:next_day"].title;
  const expressTitle = ORDER_ADAPTERS["yataxi:express"].title;
  assert.ok(nextTitle.length > 0);
  assert.ok(expressTitle.length > 0);
  assert.notEqual(nextTitle, expressTitle);
  assert.equal(
    ORDER_ADAPTERS["yataxi:express"].confirmOffer,
    confirmExpressOffer,
  );
  await assert.rejects(
    () =>
      ORDER_ADAPTERS["yataxi:express"].cancelOrder(
        "claim-id",
        /** @type {never} */ ({}),
      ),
    (err) =>
      err instanceof Error &&
      err.message === "Оформление этой услуги ещё не реализовано",
  );
});
