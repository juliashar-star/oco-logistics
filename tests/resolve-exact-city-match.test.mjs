import assert from "node:assert/strict";
import test from "node:test";

import { resolveExactCityMatch } from "../apps/web/lib/address/resolve-exact-city-match.ts";

/** Distinct-city sets from the 2026-07-31 suggest measurement; first = relevance #1. */
const MEASURED = {
  Москва: ["Москва", "Пено", "Менеуз-Москва", "Новая Москва"],
  "Санкт-Петербург": [
    "Санкт-Петербург",
    "Петергоф",
    "Великий Новгород",
    "Грозный",
    "Логоваз Санкт-Петербург (поселок Синицыно)",
  ],
  Воронеж: ["Воронеж", "Москва", "Воронеж-45", "Санкт-Петербург", "Новосибирск"],
  Ростов: ["Ростов-на-Дону", "Ростов Великий", "Ростовский", "Москва"],
  Красноармейск: ["Красноармейск", "Красноармейский", "Москва", "Щербинка"],
  Мск: ["Москва", "МСК", "Клин", "Химки"],
  Новгород: [
    "Нижний Новгород",
    "Великий Новгород",
    "Новгородский",
    "Москва",
    "Санкт-Петербург",
    "Колпино",
  ],
  Королев: [
    "Королёв",
    "Москва",
    "Санкт-Петербург",
    "Новосибирск",
    "Нижний Новгород",
    "Казань",
    "Челябинск",
  ],
};

function asSuggestions(cities) {
  return cities.map((city) => ({ city, fullAddress: city }));
}

test("measured: Москва / Санкт-Петербург / Воронеж / Красноармейск confirm", () => {
  assert.equal(
    resolveExactCityMatch("Москва", asSuggestions(MEASURED.Москва)),
    "Москва",
  );
  assert.equal(
    resolveExactCityMatch(
      "Санкт-Петербург",
      asSuggestions(MEASURED["Санкт-Петербург"]),
    ),
    "Санкт-Петербург",
  );
  assert.equal(
    resolveExactCityMatch("Воронеж", asSuggestions(MEASURED.Воронеж)),
    "Воронеж",
  );
  assert.equal(
    resolveExactCityMatch("Красноармейск", asSuggestions(MEASURED.Красноармейск)),
    "Красноармейск",
  );
});

test("measured: Королев confirms against first city Королёв (ё folded)", () => {
  assert.equal(
    resolveExactCityMatch("Королев", asSuggestions(MEASURED.Королев)),
    "Королёв",
  );
  assert.equal(
    resolveExactCityMatch("королёв", asSuggestions(MEASURED.Королев)),
    "Королёв",
  );
});

test("measured: Мск does NOT confirm (first is Москва, not МСК)", () => {
  assert.equal(resolveExactCityMatch("Мск", asSuggestions(MEASURED.Мск)), null);
});

test("measured: Ростов / Новгород do not confirm (longer first city)", () => {
  assert.equal(
    resolveExactCityMatch("Ростов", asSuggestions(MEASURED.Ростов)),
    null,
  );
  assert.equal(
    resolveExactCityMatch("Новгород", asSuggestions(MEASURED.Новгород)),
    null,
  );
});

test("empty text → null", () => {
  assert.equal(resolveExactCityMatch("", asSuggestions(MEASURED.Москва)), null);
  assert.equal(resolveExactCityMatch("   ", asSuggestions(MEASURED.Москва)), null);
});

test("no suggestions → null", () => {
  assert.equal(resolveExactCityMatch("Москва", []), null);
});
