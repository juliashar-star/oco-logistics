import assert from "node:assert/strict";
import test from "node:test";

import {
  dedupeOffersBySameProviderInterval,
  floorIsoBoundToUtcMinute,
} from "../packages/core/src/carrier-adapter/dedupe-offers-by-same-provider-interval.ts";

/** @typedef {import("../packages/core/src/carrier-adapter/types.ts").CarrierOffer} CarrierOffer */

/**
 * @param {Partial<CarrierOffer> & { offerId: string }} partial
 * @returns {CarrierOffer}
 */
function offer(partial) {
  return {
    expiresAt: "2099-01-01T00:00:00Z",
    deliveryIntervalFrom: "2099-01-02T10:00:00Z",
    deliveryIntervalTo: "2099-01-02T18:00:00Z",
    pickupIntervalFrom: "2099-01-02T08:00:00Z",
    pickupIntervalTo: "2099-01-02T12:00:00Z",
    priceRub: 400,
    ...partial,
  };
}

const CAPACITY = {
  "yataxi:courier": 2,
  "yataxi:express": 6,
};

/** @type {import("../packages/core/src/carrier-adapter/dedupe-offers-by-same-provider-interval.ts").DedupeOffersBySameProviderIntervalResolve} */
const resolve = {
  providerKeyOf(adapterKey) {
    if (adapterKey == null) return undefined;
    const colon = adapterKey.indexOf(":");
    return colon === -1 ? adapterKey : adapterKey.slice(0, colon);
  },
  serviceLimitCapacityOf(adapterKey) {
    if (adapterKey == null) return undefined;
    return CAPACITY[adapterKey];
  },
};

test("floorIsoBoundToUtcMinute: drops sub-minute noise", () => {
  assert.equal(
    floorIsoBoundToUtcMinute("2026-07-31T08:28:18.335072+00:00"),
    floorIsoBoundToUtcMinute("2026-07-31T08:28:18.365265+00:00"),
  );
  assert.equal(
    floorIsoBoundToUtcMinute("2026-07-31T08:28:18.335072+00:00"),
    "2026-07-31T08:28:00.000Z",
  );
});

test("bounds differing by 30 ms from one carrier → collapsed, cheaper kept", () => {
  // Measured: parallel courier/express calculate skew ~30 ms on from.
  const courier = offer({
    offerId: "courier-payload",
    adapterKey: "yataxi:courier",
    priceRub: 332,
    deliveryIntervalFrom: "2026-07-31T08:28:18.335072+00:00",
    deliveryIntervalTo: "2026-07-31T09:36:09.335072+00:00",
  });
  const express = offer({
    offerId: "express-payload",
    adapterKey: "yataxi:express",
    priceRub: 331,
    deliveryIntervalFrom: "2026-07-31T08:28:18.365265+00:00",
    deliveryIntervalTo: "2026-07-31T09:36:09.365265+00:00",
  });

  const result = dedupeOffersBySameProviderInterval(
    [courier, express],
    resolve,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].offerId, "express-payload");
  assert.equal(result[0].priceRub, 331);
});

test("bounds differing by 20 minutes → both kept (distinct courier vs express ladder)", () => {
  // Measured probe: courier …T09:36… vs express …T09:56… (20 min apart).
  const courier = offer({
    offerId: "courier-ladder",
    adapterKey: "yataxi:courier",
    priceRub: 385,
    deliveryIntervalFrom: "2026-07-31T08:28:18.335072+00:00",
    deliveryIntervalTo: "2026-07-31T09:36:09.335072+00:00",
  });
  const express = offer({
    offerId: "express-ladder",
    adapterKey: "yataxi:express",
    priceRub: 385,
    deliveryIntervalFrom: "2026-07-31T08:28:18.365265+00:00",
    deliveryIntervalTo: "2026-07-31T09:56:51.365265+00:00",
  });

  const result = dedupeOffersBySameProviderInterval(
    [courier, express],
    resolve,
  );
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((o) => o.offerId).sort(),
    ["courier-ladder", "express-ladder"],
  );
});

test("same interval and different prices from two services of one carrier → cheaper kept", () => {
  // Measured shape: express 331 / courier 332 at the same interval.
  const courier = offer({
    offerId: "courier-payload",
    adapterKey: "yataxi:courier",
    priceRub: 332,
  });
  const express = offer({
    offerId: "express-payload",
    adapterKey: "yataxi:express",
    priceRub: 331,
  });

  const result = dedupeOffersBySameProviderInterval(
    [courier, express],
    resolve,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].offerId, "express-payload");
  assert.equal(result[0].priceRub, 331);
});

test("same interval and equal prices → wider offerLimitCapacity kept", () => {
  const courier = offer({
    offerId: "courier-payload",
    adapterKey: "yataxi:courier",
    priceRub: 500,
  });
  const express = offer({
    offerId: "express-payload",
    adapterKey: "yataxi:express",
    priceRub: 500,
  });

  const result = dedupeOffersBySameProviderInterval(
    [courier, express],
    resolve,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].adapterKey, "yataxi:express");
});

test("equal-price tie: wider kept even when narrower is listed first", () => {
  const express = offer({
    offerId: "express-payload",
    adapterKey: "yataxi:express",
    priceRub: 500,
  });
  const courier = offer({
    offerId: "courier-payload",
    adapterKey: "yataxi:courier",
    priceRub: 500,
  });
  const result = dedupeOffersBySameProviderInterval(
    [express, courier],
    resolve,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].adapterKey, "yataxi:express");
});

test("cheaper kept even when it has the narrower capacity", () => {
  const courier = offer({
    offerId: "courier-cheap",
    adapterKey: "yataxi:courier",
    priceRub: 293,
  });
  const express = offer({
    offerId: "express-dearer",
    adapterKey: "yataxi:express",
    priceRub: 294,
  });
  const result = dedupeOffersBySameProviderInterval(
    [express, courier],
    resolve,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].offerId, "courier-cheap");
  assert.equal(result[0].adapterKey, "yataxi:courier");
});

test("same interval from two DIFFERENT carriers → both kept", () => {
  const yandex = offer({
    offerId: "yandex-o",
    adapterKey: "yataxi:express",
    priceRub: 400,
  });
  const cdek = offer({
    offerId: "cdek-o",
    adapterKey: "cdek:door",
    priceRub: 390,
  });
  const withCdekCapacity = {
    ...resolve,
    serviceLimitCapacityOf(adapterKey) {
      if (adapterKey === "cdek:door") return 10;
      return resolve.serviceLimitCapacityOf(adapterKey);
    },
  };
  const result = dedupeOffersBySameProviderInterval(
    [yandex, cdek],
    withCdekCapacity,
  );
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((o) => o.offerId).sort(),
    ["cdek-o", "yandex-o"],
  );
});

test("unrated peer in the group → not collapsed", () => {
  const nextDay = offer({
    offerId: "next-day-o",
    adapterKey: "yataxi:next_day",
    priceRub: 300,
  });
  const express = offer({
    offerId: "express-o",
    adapterKey: "yataxi:express",
    priceRub: 300,
  });
  // next_day has no entry in CAPACITY → undefined capacity.
  const result = dedupeOffersBySameProviderInterval(
    [nextDay, express],
    resolve,
  );
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((o) => o.offerId).sort(),
    ["express-o", "next-day-o"],
  );
});

test("a single offer → unchanged", () => {
  const only = offer({ offerId: "solo", adapterKey: "yataxi:express" });
  const result = dedupeOffersBySameProviderInterval([only], resolve);
  assert.deepEqual(result, [only]);
});

test("empty → empty", () => {
  assert.deepEqual(dedupeOffersBySameProviderInterval([], resolve), []);
});
