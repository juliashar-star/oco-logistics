import assert from "node:assert/strict";
import test from "node:test";

import { ORDER_ADAPTERS } from "../packages/core/src/carrier-adapter/order-adapters.ts";
import { ORDER_ADAPTER_SELLER_TITLES } from "../packages/core/src/carrier-adapter/order-adapter-seller-titles.ts";
import { confirmOffer as cdekConfirmOffer } from "../packages/core/src/carrier-adapter/cdek/client.ts";
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
    "Доставка по России",
  );
});

test("ORDER_ADAPTERS holds next_day, express and courier with distinct titles; express/courier confirm wired, cancel stays stub", async () => {
  assert.ok(ORDER_ADAPTERS["yataxi:next_day"]);
  assert.ok(ORDER_ADAPTERS["yataxi:express"]);
  assert.ok(ORDER_ADAPTERS["yataxi:courier"]);
  const nextTitle = ORDER_ADAPTERS["yataxi:next_day"].title;
  const expressTitle = ORDER_ADAPTERS["yataxi:express"].title;
  const courierTitle = ORDER_ADAPTERS["yataxi:courier"].title;
  assert.ok(nextTitle.length > 0);
  assert.ok(expressTitle.length > 0);
  assert.ok(courierTitle.length > 0);
  assert.notEqual(nextTitle, expressTitle);
  assert.notEqual(expressTitle, courierTitle);
  assert.notEqual(nextTitle, courierTitle);
  // Registry wrappers bind the entry's taxi class (same pattern as getOffers).
  assert.equal(
    typeof ORDER_ADAPTERS["yataxi:express"].confirmOffer,
    "function",
  );
  assert.equal(
    typeof ORDER_ADAPTERS["yataxi:courier"].confirmOffer,
    "function",
  );
  assert.notEqual(
    ORDER_ADAPTERS["yataxi:express"].confirmOffer,
    confirmExpressOffer,
  );
  assert.notEqual(
    ORDER_ADAPTERS["yataxi:courier"].confirmOffer,
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
  await assert.rejects(
    () =>
      ORDER_ADAPTERS["yataxi:courier"].cancelOrder(
        "claim-id",
        /** @type {never} */ ({}),
      ),
    (err) =>
      err instanceof Error &&
      err.message === "Оформление этой услуги ещё не реализовано",
  );
});

test("next_day exposes generateLabels; express and courier do not (labels resolve by orderAdapterKey)", () => {
  assert.equal(
    typeof ORDER_ADAPTERS["yataxi:next_day"].generateLabels,
    "function",
  );
  assert.equal(
    typeof ORDER_ADAPTERS["yataxi:express"].generateLabels,
    "undefined",
  );
  assert.equal(
    typeof ORDER_ADAPTERS["yataxi:courier"].generateLabels,
    "undefined",
  );
});

test("next_day exposes getHandoverAct; express and courier do not (act resolves by orderAdapterKey)", () => {
  assert.equal(
    typeof ORDER_ADAPTERS["yataxi:next_day"].getHandoverAct,
    "function",
  );
  assert.equal(
    typeof ORDER_ADAPTERS["yataxi:express"].getHandoverAct,
    "undefined",
  );
  assert.equal(
    typeof ORDER_ADAPTERS["yataxi:courier"].getHandoverAct,
    "undefined",
  );
});

test("express and courier offerLimitCapacity prefer express (wider documented limits)", () => {
  const expressCap = ORDER_ADAPTERS["yataxi:express"].offerLimitCapacity;
  const courierCap = ORDER_ADAPTERS["yataxi:courier"].offerLimitCapacity;
  assert.equal(typeof expressCap, "number");
  assert.equal(typeof courierCap, "number");
  assert.ok(expressCap > courierCap);
  assert.equal(
    ORDER_ADAPTERS["yataxi:next_day"].offerLimitCapacity,
    undefined,
  );
});

test("supportsThermalBag true on express/courier; absent on next_day", () => {
  assert.equal(ORDER_ADAPTERS["yataxi:express"].supportsThermalBag, true);
  assert.equal(ORDER_ADAPTERS["yataxi:courier"].supportsThermalBag, true);
  assert.equal(
    ORDER_ADAPTERS["yataxi:next_day"].supportsThermalBag,
    undefined,
  );
});

test("cdek:delivery confirmOffer is the same function reference as the client export; cancel stays stub", async () => {
  const entry = ORDER_ADAPTERS["cdek:delivery"];
  assert.ok(entry);
  assert.equal(entry.confirmOffer, cdekConfirmOffer);
  await assert.rejects(
    () =>
      entry.cancelOrder("cdek-uuid", /** @type {never} */ ({})),
    (err) =>
      err instanceof Error &&
      err.message === "Оформление этой услуги ещё не реализовано",
  );
});
