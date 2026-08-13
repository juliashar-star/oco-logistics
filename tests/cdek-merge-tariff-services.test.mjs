import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeCdekOffersWithServices,
  mergeCdekServiceSums,
} from "../packages/core/src/carrier-adapter/cdek/merge-tariff-services.ts";

/** The MEASURED 13.08 service block — identical on all 24 edu tariffs at 1000 ₽. */
const INSURANCE = {
  code: "INSURANCE",
  sum: 7.5,
  total_sum: 9,
  discount_percent: 0,
  discount_sum: 0,
  vat_rate: 20,
  vat_sum: 1.5,
};

/** tariffAndService reply shape: tariff_code as a STRING, status as a STRING. */
const servicesReply = (rows) => ({
  tariff_codes: rows.map(({ code, services, result = {} }) => ({
    tariff_code: code,
    status: "true",
    result: services === undefined ? result : { ...result, services },
  })),
});

const offer = (offerId, priceRub) => ({ offerId, priceRub });

// ── codes that appear on both sides ────────────────────────────────────────

test("matching codes: the service sum is added to the delivery price", () => {
  // The measured 136 «Посылка склад-склад» row: 150 net + 7.5 insurance.
  const sums = mergeCdekServiceSums(
    servicesReply([{ code: "136", services: [INSURANCE] }]),
  );
  assert.deepEqual(mergeCdekOffersWithServices([offer("cdek:136", 150)], sums), [
    { offerId: "cdek:136", priceRub: 157.5 },
  ]);
});

test("number on one side, string on the other, still joins", () => {
  // THE MEASURED TRAP: tarifflist returns 158, tariffAndService returns "158".
  // A strict === join would have matched nothing and blanked the CDEK list.
  const sums = mergeCdekServiceSums({
    tariff_codes: [{ tariff_code: 158, status: "true", result: { services: [INSURANCE] } }],
  });
  assert.deepEqual(mergeCdekOffersWithServices([offer("cdek:158", 300)], sums), [
    { offerId: "cdek:158", priceRub: 307.5 },
  ]);
});

test("every offer field other than the price survives the merge", () => {
  const sums = mergeCdekServiceSums(
    servicesReply([{ code: "136", services: [INSURANCE] }]),
  );
  const [merged] = mergeCdekOffersWithServices(
    [
      {
        offerId: "cdek:136",
        priceRub: 150,
        serviceName: "Посылка склад-склад",
        priceIsEstimate: true,
        deliveryDayFrom: "2026-08-14",
      },
    ],
    sums,
  );
  assert.equal(merged.priceRub, 157.5);
  assert.equal(merged.serviceName, "Посылка склад-склад");
  assert.equal(merged.priceIsEstimate, true);
  assert.equal(merged.deliveryDayFrom, "2026-08-14");
});

// ── one-sided codes are dropped, never shown bare ──────────────────────────

test("a code only in tarifflist is DROPPED, not priced without insurance", () => {
  const sums = mergeCdekServiceSums(
    servicesReply([{ code: "136", services: [INSURANCE] }]),
  );
  const merged = mergeCdekOffersWithServices(
    [offer("cdek:136", 150), offer("cdek:483", 325)],
    sums,
  );
  assert.deepEqual(merged, [{ offerId: "cdek:136", priceRub: 157.5 }]);
});

test("a code only in tariffAndService simply never becomes an offer", () => {
  const sums = mergeCdekServiceSums(
    servicesReply([
      { code: "136", services: [INSURANCE] },
      { code: "999", services: [INSURANCE] },
    ]),
  );
  assert.equal(sums.size, 2);
  assert.deepEqual(mergeCdekOffersWithServices([offer("cdek:136", 150)], sums), [
    { offerId: "cdek:136", priceRub: 157.5 },
  ]);
});

test("no overlap at all → no offers, never a half-priced list", () => {
  const sums = mergeCdekServiceSums(
    servicesReply([{ code: "777", services: [INSURANCE] }]),
  );
  assert.deepEqual(mergeCdekOffersWithServices([offer("cdek:136", 150)], sums), []);
});

// ── services[]: empty, absent, several, unreadable ─────────────────────────

test("empty services[] → price unchanged, offer kept", () => {
  // A real answer meaning «nothing extra», not a fault.
  const sums = mergeCdekServiceSums(servicesReply([{ code: "136", services: [] }]));
  assert.deepEqual(mergeCdekOffersWithServices([offer("cdek:136", 150)], sums), [
    { offerId: "cdek:136", priceRub: 150 },
  ]);
});

test("absent services key → price unchanged, offer kept", () => {
  const sums = mergeCdekServiceSums({
    tariff_codes: [{ tariff_code: "136", status: "true", result: { delivery_sum: 150 } }],
  });
  assert.deepEqual(mergeCdekOffersWithServices([offer("cdek:136", 150)], sums), [
    { offerId: "cdek:136", priceRub: 150 },
  ]);
});

test("services[] is null → treated as nothing extra", () => {
  const sums = mergeCdekServiceSums({
    tariff_codes: [{ tariff_code: "136", status: "true", result: { services: null } }],
  });
  assert.deepEqual(mergeCdekOffersWithServices([offer("cdek:136", 150)], sums), [
    { offerId: "cdek:136", priceRub: 150 },
  ]);
});

test("ALL services are summed, not only INSURANCE", () => {
  // The point of summing blind: a mandatory service CDEK adds later lands in the
  // price by itself instead of being dropped without anyone noticing.
  const sums = mergeCdekServiceSums(
    servicesReply([
      {
        code: "136",
        services: [
          INSURANCE,
          {
            code: "SOME_FUTURE_MANDATORY",
            sum: 12.5,
            total_sum: 15,
            vat_sum: 2.5,
            discount_percent: 0,
            discount_sum: 0,
          },
        ],
      },
    ]),
  );
  assert.deepEqual(mergeCdekOffersWithServices([offer("cdek:136", 150)], sums), [
    { offerId: "cdek:136", priceRub: 170 },
  ]);
});

test("the added figure is NET: total_sum alone is never what gets added", () => {
  // total_sum 9 = price 7.5 + vat_sum 1.5. Adding VAT here would be an adapter
  // deciding a display question for every carrier at once.
  const sums = mergeCdekServiceSums(
    servicesReply([{ code: "136", services: [INSURANCE] }]),
  );
  const [merged] = mergeCdekOffersWithServices([offer("cdek:136", 150)], sums);
  assert.equal(merged.priceRub, 157.5);
  assert.notEqual(merged.priceRub, 159);
  assert.notEqual(merged.priceRub, 150 + INSURANCE.total_sum);
});

// ── the discount lives in total_sum, not in sum ────────────────────────────

test("a DISCOUNTED service is priced from total_sum − vat_sum, not from sum", () => {
  // `sum` is «Стоимость услуги» BEFORE discount; `total_sum` is «Стоимость
  // услуги с НДС и скидкой». Here a 20 % discount takes 7.5 down to 6.0, so
  // total_sum = 7.2 with vat_sum 1.2. Using `sum` would overstate the card.
  const discounted = {
    code: "INSURANCE",
    sum: 7.5,
    discount_percent: 20,
    discount_sum: 1.5,
    vat_rate: 20,
    vat_sum: 1.2,
    total_sum: 7.2,
  };
  const sums = mergeCdekServiceSums(
    servicesReply([{ code: "136", services: [discounted] }]),
  );
  const [merged] = mergeCdekOffersWithServices([offer("cdek:136", 150)], sums);
  assert.equal(merged.priceRub, 156);
  // The pre-discount figure must NOT be what landed on the card.
  assert.notEqual(merged.priceRub, 150 + discounted.sum);
  assert.notEqual(merged.priceRub, 157.5);
});

test("several services with different discounts add up on the discounted price", () => {
  const sums = mergeCdekServiceSums(
    servicesReply([
      {
        code: "136",
        services: [
          // 10 ₽ before discount → 8 ₽ after; VAT 1.6 on top.
          { code: "INSURANCE", sum: 10, discount_percent: 20, total_sum: 9.6, vat_sum: 1.6 },
          // 20 ₽ before discount → 15 ₽ after; VAT 3 on top.
          { code: "SOME_OTHER", sum: 20, discount_percent: 25, total_sum: 18, vat_sum: 3 },
        ],
      },
    ]),
  );
  const [merged] = mergeCdekOffersWithServices([offer("cdek:136", 150)], sums);
  assert.equal(merged.priceRub, 173); // 150 + 8 + 15
  assert.notEqual(merged.priceRub, 180); // 150 + 10 + 20, the pre-discount sums
});

test("numeric-string total_sum and vat_sum are accepted", () => {
  const sums = mergeCdekServiceSums(
    servicesReply([
      { code: "136", services: [{ code: "INSURANCE", total_sum: "9", vat_sum: "1.5" }] },
    ]),
  );
  assert.deepEqual(mergeCdekOffersWithServices([offer("cdek:136", 150)], sums), [
    { offerId: "cdek:136", priceRub: 157.5 },
  ]);
});

for (const field of ["total_sum", "vat_sum"]) {
  for (const [label, value] of [
    ["a non-numeric string", "около семи"],
    ["an empty string", ""],
    ["whitespace", "   "],
    ["null", null],
    ["undefined", undefined],
    ["the key missing", Symbol.for("omit")],
    ["an object", { value: 7.5 }],
    ["an array", [7.5]],
    ["a boolean", true],
    ["NaN-producing string", "7,5"],
  ]) {
    test(`unreadable ${field} (${label}) → the tariff is dropped, never falls back to sum`, () => {
      // `sum` is deliberately present and perfectly readable: falling back to it
      // would silently restore the pre-discount formula, invisibly.
      const service = { code: "INSURANCE", sum: 7.5, total_sum: 9, vat_sum: 1.5 };
      if (value === Symbol.for("omit")) {
        delete service[field];
      } else {
        service[field] = value;
      }
      const sums = mergeCdekServiceSums(servicesReply([{ code: "136", services: [service] }]));
      assert.equal(sums.has("136"), false);
      assert.deepEqual(mergeCdekOffersWithServices([offer("cdek:136", 150)], sums), []);
    });
  }
}

test("a readable sum does not rescue a tariff with no total_sum", () => {
  const sums = mergeCdekServiceSums(
    servicesReply([{ code: "136", services: [{ code: "INSURANCE", sum: 7.5 }] }]),
  );
  assert.equal(sums.has("136"), false);
  assert.deepEqual(mergeCdekOffersWithServices([offer("cdek:136", 150)], sums), []);
});

test("one unreadable tariff does not poison its neighbours", () => {
  const sums = mergeCdekServiceSums(
    servicesReply([
      { code: "136", services: [INSURANCE] },
      { code: "483", services: [{ code: "INSURANCE", total_sum: "нет", vat_sum: 1.5 }] },
    ]),
  );
  assert.deepEqual(
    mergeCdekOffersWithServices([offer("cdek:136", 150), offer("cdek:483", 325)], sums),
    [{ offerId: "cdek:136", priceRub: 157.5 }],
  );
});

// ── malformed replies and offer ids ────────────────────────────────────────

for (const [label, raw] of [
  ["null", null],
  ["undefined", undefined],
  ["a string", "tariff_codes"],
  ["a number", 24],
  ["an array", []],
  ["an object without tariff_codes", { errors: [] }],
  ["tariff_codes not an array", { tariff_codes: "24" }],
]) {
  test(`malformed tariffAndService reply (${label}) → empty map, so nothing is offered`, () => {
    const sums = mergeCdekServiceSums(raw);
    assert.equal(sums.size, 0);
    assert.deepEqual(mergeCdekOffersWithServices([offer("cdek:136", 150)], sums), []);
  });
}

test("rows with an unusable tariff_code or no result are skipped", () => {
  const sums = mergeCdekServiceSums({
    tariff_codes: [
      null,
      "136",
      { status: "true", result: { services: [INSURANCE] } },
      { tariff_code: "", status: "true", result: { services: [INSURANCE] } },
      { tariff_code: "   ", status: "true", result: { services: [INSURANCE] } },
      { tariff_code: true, status: "true", result: { services: [INSURANCE] } },
      { tariff_code: "158", status: "false", result: null },
      { tariff_code: "136", status: "true", result: { services: [INSURANCE] } },
    ],
  });
  assert.deepEqual([...sums.keys()], ["136"]);
});

test("a tariff_code with surrounding whitespace still joins", () => {
  const sums = mergeCdekServiceSums(
    servicesReply([{ code: "  136  ", services: [INSURANCE] }]),
  );
  assert.deepEqual(mergeCdekOffersWithServices([offer("cdek:136", 150)], sums), [
    { offerId: "cdek:136", priceRub: 157.5 },
  ]);
});

for (const offerId of ["136", "cdek", "cdek:", "yataxi:136", "", "   "]) {
  test(`an offerId that is not cdek:<code> (${JSON.stringify(offerId)}) is dropped`, () => {
    const sums = mergeCdekServiceSums(
      servicesReply([{ code: "136", services: [INSURANCE] }]),
    );
    assert.deepEqual(mergeCdekOffersWithServices([offer(offerId, 150)], sums), []);
  });
}

test("an empty offer list stays empty", () => {
  const sums = mergeCdekServiceSums(
    servicesReply([{ code: "136", services: [INSURANCE] }]),
  );
  assert.deepEqual(mergeCdekOffersWithServices([], sums), []);
});

test("the input offers are not mutated", () => {
  const sums = mergeCdekServiceSums(
    servicesReply([{ code: "136", services: [INSURANCE] }]),
  );
  const original = offer("cdek:136", 150);
  mergeCdekOffersWithServices([original], sums);
  assert.equal(original.priceRub, 150);
});
