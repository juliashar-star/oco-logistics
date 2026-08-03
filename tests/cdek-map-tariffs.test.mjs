import assert from "node:assert/strict";
import test from "node:test";

import { mapCdekTariffsToOffers } from "../packages/core/src/carrier-adapter/cdek/map-cdek-tariffs.ts";

/**
 * Verbatim recording: CDEK calculator/tarifflist Moscow→Moscow type=1,
 * trimmed to the five keys the mapper reads. Wire order preserved.
 */
const MEASURED_MOSCOW_TYPE1 = {
  tariff_codes: [
    {
      tariff_code: 158,
      tariff_name: "Забор груза дверь-склад",
      delivery_mode: 2,
      delivery_sum: 300.0,
      delivery_date_range: { min: "2026-08-01", max: "2026-08-02" },
    },
    {
      tariff_code: 59,
      tariff_name: "Супер-экспресс до 12 дверь-дверь",
      delivery_mode: 1,
      delivery_sum: 1080.0,
      delivery_date_range: { min: "2026-08-03", max: "2026-08-03" },
    },
    {
      tariff_code: 777,
      tariff_name: "Супер-экспресс до 12 дверь-склад",
      delivery_mode: 2,
      delivery_sum: 925.68,
      delivery_date_range: { min: "2026-08-03", max: "2026-08-03" },
    },
    {
      tariff_code: 778,
      tariff_name: "Супер-экспресс до 12 склад-дверь",
      delivery_mode: 3,
      delivery_sum: 925.68,
      delivery_date_range: { min: "2026-08-03", max: "2026-08-03" },
    },
    {
      tariff_code: 60,
      tariff_name: "Супер-экспресс до 14 дверь-дверь",
      delivery_mode: 1,
      delivery_sum: 980.0,
      delivery_date_range: { min: "2026-08-03", max: "2026-08-03" },
    },
    {
      tariff_code: 786,
      tariff_name: "Супер-экспресс до 14 дверь-склад",
      delivery_mode: 2,
      delivery_sum: 840.0,
      delivery_date_range: { min: "2026-08-03", max: "2026-08-03" },
    },
    {
      tariff_code: 787,
      tariff_name: "Супер-экспресс до 14 склад-дверь",
      delivery_mode: 3,
      delivery_sum: 840.0,
      delivery_date_range: { min: "2026-08-03", max: "2026-08-03" },
    },
    {
      tariff_code: 788,
      tariff_name: "Супер-экспресс до 14 склад-склад",
      delivery_mode: 4,
      delivery_sum: 660.0,
      delivery_date_range: { min: "2026-08-03", max: "2026-08-03" },
    },
    {
      tariff_code: 61,
      tariff_name: "Супер-экспресс до 16 дверь-дверь",
      delivery_mode: 1,
      delivery_sum: 880.0,
      delivery_date_range: { min: "2026-08-03", max: "2026-08-03" },
    },
    {
      tariff_code: 795,
      tariff_name: "Супер-экспресс до 16 дверь-склад",
      delivery_mode: 2,
      delivery_sum: 754.32,
      delivery_date_range: { min: "2026-08-03", max: "2026-08-03" },
    },
    {
      tariff_code: 796,
      tariff_name: "Супер-экспресс до 16 склад-дверь",
      delivery_mode: 3,
      delivery_sum: 754.32,
      delivery_date_range: { min: "2026-08-03", max: "2026-08-03" },
    },
    {
      tariff_code: 797,
      tariff_name: "Супер-экспресс до 16 склад-склад",
      delivery_mode: 4,
      delivery_sum: 592.73,
      delivery_date_range: { min: "2026-08-03", max: "2026-08-03" },
    },
    {
      tariff_code: 480,
      tariff_name: "Экспресс дверь-дверь",
      delivery_mode: 1,
      delivery_sum: 485.0,
      delivery_date_range: { min: "2026-08-01", max: "2026-08-02" },
    },
    {
      tariff_code: 481,
      tariff_name: "Экспресс дверь-склад",
      delivery_mode: 2,
      delivery_sum: 415.0,
      delivery_date_range: { min: "2026-08-01", max: "2026-08-02" },
    },
    {
      tariff_code: 482,
      tariff_name: "Экспресс склад-дверь",
      delivery_mode: 3,
      delivery_sum: 415.0,
      delivery_date_range: { min: "2026-08-01", max: "2026-08-02" },
    },
    {
      tariff_code: 483,
      tariff_name: "Экспресс склад-склад",
      delivery_mode: 4,
      delivery_sum: 325.0,
      delivery_date_range: { min: "2026-08-01", max: "2026-08-02" },
    },
    {
      tariff_code: 3,
      tariff_name: "Супер-экспресс до 18 дверь-дверь",
      delivery_mode: 1,
      delivery_sum: 780.0,
      delivery_date_range: { min: "2026-08-03", max: "2026-08-03" },
    },
    {
      tariff_code: 804,
      tariff_name: "Супер-экспресс до 18 дверь-склад",
      delivery_mode: 2,
      delivery_sum: 668.64,
      delivery_date_range: { min: "2026-08-03", max: "2026-08-03" },
    },
    {
      tariff_code: 805,
      tariff_name: "Супер-экспресс до 18 склад-дверь",
      delivery_mode: 3,
      delivery_sum: 668.64,
      delivery_date_range: { min: "2026-08-03", max: "2026-08-03" },
    },
    {
      tariff_code: 806,
      tariff_name: "Супер-экспресс до 18 склад-склад",
      delivery_mode: 4,
      delivery_sum: 525.45,
      delivery_date_range: { min: "2026-08-03", max: "2026-08-03" },
    },
    {
      tariff_code: 139,
      tariff_name: "Посылка дверь-дверь",
      delivery_mode: 1,
      delivery_sum: 440.0,
      delivery_date_range: { min: "2026-08-02", max: "2026-08-02" },
    },
    {
      tariff_code: 138,
      tariff_name: "Посылка дверь-склад",
      delivery_mode: 2,
      delivery_sum: 295.0,
      delivery_date_range: { min: "2026-08-02", max: "2026-08-02" },
    },
    {
      tariff_code: 137,
      tariff_name: "Посылка склад-дверь",
      delivery_mode: 3,
      delivery_sum: 295.0,
      delivery_date_range: { min: "2026-08-02", max: "2026-08-02" },
    },
    {
      tariff_code: 136,
      tariff_name: "Посылка склад-склад",
      delivery_mode: 4,
      delivery_sum: 150.0,
      delivery_date_range: { min: "2026-08-02", max: "2026-08-02" },
    },
  ],
};

test("deliveryMode 4 → exactly 5 offers with measured ids and prices", () => {
  const offers = mapCdekTariffsToOffers(MEASURED_MOSCOW_TYPE1, 4);
  assert.equal(offers.length, 5);
  assert.deepEqual(
    offers.map((o) => o.offerId),
    ["cdek:788", "cdek:797", "cdek:483", "cdek:806", "cdek:136"],
  );
  assert.deepEqual(
    offers.map((o) => o.priceRub),
    [660, 592.73, 325, 525.45, 150],
  );
  // Task lists presence of these ids (order is wire order among mode-4 rows).
  for (const id of ["cdek:136", "cdek:483", "cdek:806", "cdek:797", "cdek:788"]) {
    assert.ok(offers.some((o) => o.offerId === id), `missing ${id}`);
  }
  for (const price of [150, 325, 525.45, 592.73, 660]) {
    assert.ok(offers.some((o) => o.priceRub === price), `missing price ${price}`);
  }
});

test("deliveryMode 1 → exactly 6 offers", () => {
  const offers = mapCdekTariffsToOffers(MEASURED_MOSCOW_TYPE1, 1);
  assert.equal(offers.length, 6);
  assert.deepEqual(
    offers.map((o) => o.offerId),
    ["cdek:59", "cdek:60", "cdek:61", "cdek:480", "cdek:3", "cdek:139"],
  );
});

test("deliveryMode with no matching rows → []", () => {
  assert.deepEqual(mapCdekTariffsToOffers(MEASURED_MOSCOW_TYPE1, 99), []);
});

test("every mapped offer: blank expiry and four interval fields", () => {
  const offers = mapCdekTariffsToOffers(MEASURED_MOSCOW_TYPE1, 4);
  for (const offer of offers) {
    assert.equal(offer.expiresAt, "");
    assert.equal(offer.deliveryIntervalFrom, "");
    assert.equal(offer.deliveryIntervalTo, "");
    assert.equal(offer.pickupIntervalFrom, "");
    assert.equal(offer.pickupIntervalTo, "");
  }
});

test("every mapped offer: priceIsEstimate === true", () => {
  const offers = mapCdekTariffsToOffers(MEASURED_MOSCOW_TYPE1, 1);
  assert.ok(offers.length > 0);
  for (const offer of offers) {
    assert.equal(offer.priceIsEstimate, true);
  }
});

test("serviceName equals tariff_name verbatim", () => {
  const offers = mapCdekTariffsToOffers(MEASURED_MOSCOW_TYPE1, 4);
  const byId = new Map(offers.map((o) => [o.offerId, o]));
  assert.equal(byId.get("cdek:136").serviceName, "Посылка склад-склад");
  assert.equal(byId.get("cdek:483").serviceName, "Экспресс склад-склад");
  assert.equal(
    byId.get("cdek:806").serviceName,
    "Супер-экспресс до 18 склад-склад",
  );
});

test("deliveryDayFrom/To equal delivery_date_range min/max verbatim", () => {
  const offers = mapCdekTariffsToOffers(MEASURED_MOSCOW_TYPE1, 4);
  const byId = new Map(offers.map((o) => [o.offerId, o]));
  assert.equal(byId.get("cdek:136").deliveryDayFrom, "2026-08-02");
  assert.equal(byId.get("cdek:136").deliveryDayTo, "2026-08-02");
  assert.equal(byId.get("cdek:483").deliveryDayFrom, "2026-08-01");
  assert.equal(byId.get("cdek:483").deliveryDayTo, "2026-08-02");
  assert.equal(byId.get("cdek:788").deliveryDayFrom, "2026-08-03");
  assert.equal(byId.get("cdek:788").deliveryDayTo, "2026-08-03");
});

test("row missing delivery_date_range → day keys ABSENT (not empty string)", () => {
  const raw = {
    tariff_codes: [
      {
        tariff_code: 136,
        tariff_name: "Посылка склад-склад",
        delivery_mode: 4,
        delivery_sum: 150,
      },
    ],
  };
  const [offer] = mapCdekTariffsToOffers(raw, 4);
  assert.ok(offer);
  assert.equal("deliveryDayFrom" in offer, false);
  assert.equal("deliveryDayTo" in offer, false);
});

test("skip rows: tariff_code missing, delivery_sum null, delivery_sum \"abc\"", () => {
  const raw = {
    tariff_codes: [
      {
        tariff_name: "no code",
        delivery_mode: 4,
        delivery_sum: 100,
        delivery_date_range: { min: "2026-08-02", max: "2026-08-02" },
      },
      {
        tariff_code: 200,
        tariff_name: "null sum",
        delivery_mode: 4,
        delivery_sum: null,
        delivery_date_range: { min: "2026-08-02", max: "2026-08-02" },
      },
      {
        tariff_code: 201,
        tariff_name: "abc sum",
        delivery_mode: 4,
        delivery_sum: "abc",
        delivery_date_range: { min: "2026-08-02", max: "2026-08-02" },
      },
      {
        tariff_code: 136,
        tariff_name: "ok",
        delivery_mode: 4,
        delivery_sum: 150,
        delivery_date_range: { min: "2026-08-02", max: "2026-08-02" },
      },
    ],
  };
  const offers = mapCdekTariffsToOffers(raw, 4);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].offerId, "cdek:136");
});

test("delivery_sum as string \"295.5\" → accepted as 295.5", () => {
  const raw = {
    tariff_codes: [
      {
        tariff_code: 138,
        tariff_name: "Посылка дверь-склад",
        delivery_mode: 2,
        delivery_sum: "295.5",
        delivery_date_range: { min: "2026-08-02", max: "2026-08-02" },
      },
    ],
  };
  const offers = mapCdekTariffsToOffers(raw, 2);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].priceRub, 295.5);
});

test("extra unknown fields → mapped; rawOffer deep-equals the row including extras", () => {
  const row = {
    tariff_code: 136,
    tariff_name: "Посылка склад-склад",
    delivery_mode: 4,
    delivery_sum: 150,
    delivery_date_range: { min: "2026-08-02", max: "2026-08-02" },
    period_min: 1,
    period_max: 1,
    calendar_min: 1,
    mystery: { nested: true },
  };
  const offers = mapCdekTariffsToOffers({ tariff_codes: [row] }, 4);
  assert.equal(offers.length, 1);
  assert.equal(offers[0].offerId, "cdek:136");
  assert.equal(offers[0].priceRub, 150);
  assert.deepEqual(offers[0].rawOffer, row);
});

test("raw null / {} / { tariff_codes: \"nope\" } → []", () => {
  assert.deepEqual(mapCdekTariffsToOffers(null, 4), []);
  assert.deepEqual(mapCdekTariffsToOffers({}, 4), []);
  assert.deepEqual(mapCdekTariffsToOffers({ tariff_codes: "nope" }, 4), []);
});

test("input order preserved among filtered mode", () => {
  const offers = mapCdekTariffsToOffers(MEASURED_MOSCOW_TYPE1, 4);
  assert.deepEqual(
    offers.map((o) => o.offerId),
    ["cdek:788", "cdek:797", "cdek:483", "cdek:806", "cdek:136"],
  );
});
