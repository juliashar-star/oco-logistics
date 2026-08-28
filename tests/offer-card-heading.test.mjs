import assert from "node:assert/strict";
import test from "node:test";

import { offerCardHeading } from "../apps/web/lib/shipments/offer-card-heading.ts";

const YANDEX_TITLE = "Доставка по России";
const CDEK_TITLE = "Доставка по России";
const EXPRESS_TITLE = "Доставка в тот же день";

// ── which of the two sources wins ──────────────────────────────────────────

test("the carrier's own serviceName wins over the registry title", () => {
  const offer = {
    carrierName: "СДЭК",
    serviceName: "Посылка склад-склад",
    serviceTitle: CDEK_TITLE,
  };
  assert.equal(
    offerCardHeading(offer, [offer, { serviceTitle: EXPRESS_TITLE }]),
    "СДЭК · Посылка склад-склад",
  );
});

test("serviceName wins even when the title would have been suppressed", () => {
  // One distinct title across the list, so shouldShowOfferServiceTitle is
  // false — but serviceName never depends on that check.
  const offer = {
    carrierName: "СДЭК",
    serviceName: "Экономичная посылка",
    serviceTitle: CDEK_TITLE,
  };
  assert.equal(
    offerCardHeading(offer, [offer, { serviceTitle: CDEK_TITLE }]),
    "СДЭК · Экономичная посылка",
  );
});

test("registry title is used when the offer carries no serviceName", () => {
  const offer = { carrierName: "Яндекс Доставка", serviceTitle: YANDEX_TITLE };
  assert.equal(
    offerCardHeading(offer, [offer, { serviceTitle: EXPRESS_TITLE }]),
    "Яндекс Доставка · Доставка по России",
  );
});

// ── suppression is a property of the WHOLE list ────────────────────────────

test("one title shared by every offer is suppressed — carrier name alone", () => {
  const offer = { carrierName: "Яндекс Доставка", serviceTitle: YANDEX_TITLE };
  assert.equal(
    offerCardHeading(offer, [offer, { serviceTitle: YANDEX_TITLE }]),
    "Яндекс Доставка",
  );
});

test("a single-offer list suppresses the title too", () => {
  const offer = { carrierName: "Яндекс Доставка", serviceTitle: YANDEX_TITLE };
  assert.equal(offerCardHeading(offer, [offer]), "Яндекс Доставка");
});

test("an empty serviceName is treated as absent, not as an empty service", () => {
  const offer = {
    carrierName: "СДЭК",
    serviceName: "",
    serviceTitle: CDEK_TITLE,
  };
  assert.equal(
    offerCardHeading(offer, [offer, { serviceTitle: EXPRESS_TITLE }]),
    "СДЭК · Доставка по России",
  );
});

test("a blank serviceTitle on every offer leaves the carrier name alone", () => {
  const offer = { carrierName: "СДЭК", serviceTitle: "" };
  assert.equal(
    offerCardHeading(offer, [offer, { serviceTitle: "" }]),
    "СДЭК",
  );
});

// ── THE KNOWN COLLISION, pinned as it behaves now ──────────────────────────

test("yataxi:next_day and cdek:delivery share a title — headings separate only by carrier", () => {
  // order-adapter-seller-titles.ts:9 and :14 are the same string, flagged at
  // offer-dto.ts:58. This test does not assert the collision is GOOD — it pins
  // what the screen does today, so that changing the titles has to change a
  // test rather than slip through.
  const yandex = { carrierName: "Яндекс Доставка", serviceTitle: YANDEX_TITLE };
  const cdek = { carrierName: "СДЭК", serviceTitle: CDEK_TITLE };
  const list = [yandex, cdek];

  // Both titles identical → the suppression fires and BOTH lose the service
  // half, leaving only the carrier name to tell them apart.
  assert.equal(offerCardHeading(yandex, list), "Яндекс Доставка");
  assert.equal(offerCardHeading(cdek, list), "СДЭК");
});

test("the collision is masked when CDEK sends its own tariff name", () => {
  // The common case in practice — but it is the carrier's habit, not a
  // guarantee, which is why the test above exists alongside this one.
  const yandex = { carrierName: "Яндекс Доставка", serviceTitle: YANDEX_TITLE };
  const cdek = {
    carrierName: "СДЭК",
    serviceName: "Посылка склад-склад",
    serviceTitle: CDEK_TITLE,
  };
  const list = [yandex, cdek];

  assert.equal(offerCardHeading(yandex, list), "Яндекс Доставка");
  assert.equal(offerCardHeading(cdek, list), "СДЭК · Посылка склад-склад");
});

// ── no internal key ever reaches the heading ───────────────────────────────

test("no provider key or adapter key appears in a heading", () => {
  const offer = {
    carrierName: "Яндекс Доставка",
    serviceName: "Посылка склад-склад",
    serviceTitle: YANDEX_TITLE,
  };
  const heading = offerCardHeading(offer, [
    offer,
    { serviceTitle: EXPRESS_TITLE },
  ]);
  for (const key of ["yataxi", "cdek", "next_day", "express", "courier"]) {
    assert.equal(
      heading.toLowerCase().includes(key),
      false,
      `«${key}» leaked into: ${heading}`,
    );
  }
});
