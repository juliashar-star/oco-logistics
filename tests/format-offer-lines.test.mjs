import assert from "node:assert/strict";
import test from "node:test";

import {
  formatOfferDeliveryDays,
  formatOfferInterval,
} from "../apps/web/lib/date/format-offer-interval.ts";
import {
  formatOfferDeliveryLine,
  formatOfferPickupLine,
} from "../apps/web/lib/date/format-offer-lines.ts";

const NOW = new Date("2026-07-27T06:00:00.000Z");

test("delivery: timed interval present → equals formatOfferInterval", () => {
  const offer = {
    deliveryIntervalFrom: "2026-07-27T10:00:00.000Z",
    deliveryIntervalTo: "2026-07-27T14:00:00.000Z",
    pickupIntervalFrom: "",
    pickupIntervalTo: "",
  };
  const expected = formatOfferInterval(
    offer.deliveryIntervalFrom,
    offer.deliveryIntervalTo,
    NOW,
  );
  assert.ok(expected.length > 0);
  assert.equal(formatOfferDeliveryLine(offer, NOW), expected);
});

test("delivery: interval blank + days present → equals formatOfferDeliveryDays, no colon", () => {
  const offer = {
    deliveryIntervalFrom: "",
    deliveryIntervalTo: "",
    pickupIntervalFrom: "",
    pickupIntervalTo: "",
    deliveryDayFrom: "2026-08-03",
    deliveryDayTo: "2026-08-04",
  };
  const expected = formatOfferDeliveryDays(
    offer.deliveryDayFrom,
    offer.deliveryDayTo,
    NOW,
  );
  assert.equal(expected, "3–4 августа");
  const line = formatOfferDeliveryLine(offer, NOW);
  assert.equal(line, expected);
  assert.equal(line.includes(":"), false);
});

test("delivery: interval blank + days blank → \"\"", () => {
  const offer = {
    deliveryIntervalFrom: "",
    deliveryIntervalTo: "",
    pickupIntervalFrom: "",
    pickupIntervalTo: "",
  };
  assert.equal(formatOfferDeliveryLine(offer, NOW), "");
});

test("delivery: interval present AND days present → interval wins, day text absent", () => {
  const offer = {
    deliveryIntervalFrom: "2026-07-27T10:00:00.000Z",
    deliveryIntervalTo: "2026-07-27T14:00:00.000Z",
    pickupIntervalFrom: "",
    pickupIntervalTo: "",
    deliveryDayFrom: "2026-08-03",
    deliveryDayTo: "2026-08-04",
  };
  const timed = formatOfferInterval(
    offer.deliveryIntervalFrom,
    offer.deliveryIntervalTo,
    NOW,
  );
  const dayText = formatOfferDeliveryDays(
    offer.deliveryDayFrom,
    offer.deliveryDayTo,
    NOW,
  );
  const line = formatOfferDeliveryLine(offer, NOW);
  assert.equal(line, timed);
  assert.notEqual(dayText, "");
  assert.equal(line.includes(dayText), false);
});

test("pickup: timed interval → non-empty", () => {
  const offer = {
    deliveryIntervalFrom: "",
    deliveryIntervalTo: "",
    pickupIntervalFrom: "2026-07-27T08:00:00.000Z",
    pickupIntervalTo: "2026-07-27T12:00:00.000Z",
  };
  const line = formatOfferPickupLine(offer, NOW);
  assert.ok(line.length > 0);
  assert.equal(
    line,
    formatOfferInterval(
      offer.pickupIntervalFrom,
      offer.pickupIntervalTo,
      NOW,
    ),
  );
});

test("pickup: blank → \"\" even when delivery days are present", () => {
  const offer = {
    deliveryIntervalFrom: "",
    deliveryIntervalTo: "",
    pickupIntervalFrom: "",
    pickupIntervalTo: "",
    deliveryDayFrom: "2026-08-03",
    deliveryDayTo: "2026-08-04",
  };
  assert.equal(formatOfferPickupLine(offer, NOW), "");
});
