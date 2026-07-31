/**
 * Confirm typed/autofilled city text against the FIRST suggestion only.
 *
 * WHY the first suggestion: DaData ranks by relevance. Measured 2026-07-31 via
 * GET /api/address/suggest — first `city` vs query (trim, lower, ё→е):
 *   Москва → Москва (confirm)
 *   Санкт-Петербург → Санкт-Петербург (confirm)
 *   Воронеж → Воронеж (confirm)
 *   Красноармейск → Красноармейск (confirm)
 *   Королев → Королёв (confirm; ё folded)
 *   Мск → Москва (no — stops the МСК-settlement trap; «Мск» ≠ first city)
 *   Ростов → Ростов-на-Дону (no)
 *   Новгород → Нижний Новгород (no)
 * A whole-response uniqueness rule never fired (Москва alone returned 4 cities).
 * «Any city equals text» wrongly confirmed Мск against a settlement named МСК.
 */
export function resolveExactCityMatch(
  text: string,
  suggestions: ReadonlyArray<{ city: string }>,
): string | null {
  const first = suggestions[0];
  if (!first) {
    return null;
  }

  const typed = normalizeCityMatchText(text);
  if (!typed) {
    return null;
  }

  const city = first.city.trim();
  if (!city) {
    return null;
  }

  if (normalizeCityMatchText(city) !== typed) {
    return null;
  }

  return city;
}

/**
 * Same fold as match-pickup-point-option-label's private normalizeForMatch
 * (second occurrence — not lifted; that would be a new shared module + rewire).
 */
function normalizeCityMatchText(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
}
