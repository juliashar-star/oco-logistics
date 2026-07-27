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

test("ORDER_ADAPTERS holds next_day and express with distinct titles; express confirmOffer rejects", async () => {
  assert.ok(ORDER_ADAPTERS["yataxi:next_day"]);
  assert.ok(ORDER_ADAPTERS["yataxi:express"]);
  const nextTitle = ORDER_ADAPTERS["yataxi:next_day"].title;
  const expressTitle = ORDER_ADAPTERS["yataxi:express"].title;
  assert.ok(nextTitle.length > 0);
  assert.ok(expressTitle.length > 0);
  assert.notEqual(nextTitle, expressTitle);
  await assert.rejects(
    () =>
      ORDER_ADAPTERS["yataxi:express"].confirmOffer(
        /** @type {never} */ ({ offerId: "offer-id" }),
        /** @type {never} */ ({}),
        /** @type {never} */ ({}),
      ),
    (err) =>
      err instanceof Error &&
      err.message === "Оформление этой услуги ещё не реализовано",
  );
});
