import assert from "node:assert/strict";
import test from "node:test";

import { ORDER_ADAPTERS } from "../packages/core/src/carrier-adapter/order-adapters.ts";
import { ORDER_ADAPTER_SELLER_TITLES } from "../packages/core/src/carrier-adapter/order-adapter-seller-titles.ts";
import {
  cancelCdekOrder,
  confirmOffer as cdekConfirmOffer,
} from "../packages/core/src/carrier-adapter/cdek/client.ts";
import {
  cancelExpressOrder,
  confirmExpressOffer,
} from "../packages/core/src/carrier-adapter/yandex/express-client.ts";
import { yandexAdapter } from "../packages/core/src/carrier-adapter/yandex/adapter.ts";
import {
  FREE_CANCEL_BOUNDARY_UNKNOWN,
  FREE_CANCEL_UNTIL_COURIER_PICKUP,
  FREE_CANCEL_UNTIL_WAREHOUSE_INTAKE,
} from "../packages/core/src/carrier-adapter/free-cancel-boundaries.ts";

const KNOWN_FREE_CANCEL_BOUNDARIES = new Set([
  FREE_CANCEL_UNTIL_COURIER_PICKUP,
  FREE_CANCEL_UNTIL_WAREHOUSE_INTAKE,
  FREE_CANCEL_BOUNDARY_UNKNOWN,
]);

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
  // Both Express entries now cancel for real. Identity, not a typeof check:
  // cancelOrder takes (providerOrderId, credentials) with no taxi class, so
  // unlike getOffers / confirmOffer it needs no per-entry wrapper — and a
  // wrapper appearing here would be a sign someone bound a class it must not
  // depend on.
  assert.equal(
    ORDER_ADAPTERS["yataxi:express"].cancelOrder,
    cancelExpressOrder,
  );
  assert.equal(
    ORDER_ADAPTERS["yataxi:courier"].cancelOrder,
    cancelExpressOrder,
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

test("every ORDER_ADAPTERS entry SETS freeCancelBoundary", () => {
  // KEY PRESENCE, not the resolved value. The route defaults an absent boundary
  // to "unknown", so asserting the resolved string would pass for an entry that
  // never set one — the exact drift this test exists to catch. A new carrier
  // must state its cancellation terms, even if the statement is «unknown»,
  // because the card shows a sentence for every offer either way.
  for (const [key, entry] of Object.entries(ORDER_ADAPTERS)) {
    assert.ok(
      Object.hasOwn(entry, "freeCancelBoundary"),
      `${key} must set freeCancelBoundary`,
    );
    assert.ok(
      KNOWN_FREE_CANCEL_BOUNDARIES.has(entry.freeCancelBoundary),
      `${key} has an unknown boundary value: ${entry.freeCancelBoundary}`,
    );
  }
});

test("the boundaries the four entries carry today", () => {
  assert.equal(
    ORDER_ADAPTERS["yataxi:express"].freeCancelBoundary,
    FREE_CANCEL_UNTIL_COURIER_PICKUP,
  );
  assert.equal(
    ORDER_ADAPTERS["yataxi:courier"].freeCancelBoundary,
    FREE_CANCEL_UNTIL_COURIER_PICKUP,
  );
  assert.equal(
    ORDER_ADAPTERS["cdek:delivery"].freeCancelBoundary,
    FREE_CANCEL_UNTIL_WAREHOUSE_INTAKE,
  );
  // Set on purpose, not forgotten: request/* documents no boundary and we have
  // measured none.
  assert.equal(
    ORDER_ADAPTERS["yataxi:next_day"].freeCancelBoundary,
    FREE_CANCEL_BOUNDARY_UNKNOWN,
  );
});

test("no entry stores seller-facing wording instead of a key", () => {
  for (const [key, entry] of Object.entries(ORDER_ADAPTERS)) {
    assert.doesNotMatch(
      entry.freeCancelBoundary,
      /[А-Яа-яЁё]/,
      `${key} stores Russian text where a key belongs`,
    );
  }
});

test("cdek:delivery confirmOffer is the same function reference as the client export; cancel stays stub", async () => {
  const entry = ORDER_ADAPTERS["cdek:delivery"];
  assert.ok(entry);
  assert.equal(entry.confirmOffer, cdekConfirmOffer);
  // CDEK cancels for real now — the last stub is gone. Identity, matching the
  // Express entries: cancelOrder needs no per-entry wrapper.
  assert.equal(entry.cancelOrder, cancelCdekOrder);
});

test("no ORDER_ADAPTERS entry is left throwing the not-implemented stub", () => {
  // IDENTITY, not typeof: a stub is a function too, so a typeof check could
  // never fail for the reason this test is named after. Every entry must BE one
  // of the three real implementations — a reintroduced stub, or a new adapter
  // wired to one, is a value that appears in none of them.
  const REAL_CANCELS = new Map([
    [yandexAdapter.cancelOrder, "yandexAdapter.cancelOrder"],
    [cancelExpressOrder, "cancelExpressOrder"],
    [cancelCdekOrder, "cancelCdekOrder"],
  ]);

  for (const [key, entry] of Object.entries(ORDER_ADAPTERS)) {
    assert.ok(
      REAL_CANCELS.has(entry.cancelOrder),
      `${key}.cancelOrder is not one of the real implementations (${[...REAL_CANCELS.values()].join(", ")}) — a stub or an unwired adapter?`,
    );
  }
});
