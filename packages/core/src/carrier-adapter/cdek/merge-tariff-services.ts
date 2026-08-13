/**
 * Merge the two CDEK calculator replies into one price per tariff.
 *
 * WHY TWO REPLIES AT ALL: /v2/calculator/tarifflist carries `tariff_name` and
 * `delivery_mode` but accepts neither a declared value nor services, so its
 * `delivery_sum` never includes the insurance the seller will actually be
 * charged. /v2/calculator/tariffAndService accepts services and returns their
 * cost, but (MEASURED 13.08, edu, all 24 tariffs) its rows carry NEITHER
 * `tariff_name` NOR `delivery_mode` — checked by key presence, not by value.
 * Neither reply alone can produce a correct card.
 */

/** service sums keyed by tariff code, already stringified. */
export type CdekServiceSums = Map<string, number>;

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * TARIFF CODES ARE COMPARED AS STRINGS, ON BOTH SIDES, DELIBERATELY.
 *
 * MEASURED 13.08 on edu with one identical input: `tarifflist` returns
 * `tariff_code` as a NUMBER (158) and `tariffAndService` returns it as a STRING
 * ("158"). The two sets are otherwise identical — all 24 codes on both sides —
 * so a strict `===` join would have matched NOTHING and quietly produced an
 * empty CDEK list. Normalising one side only would work today and break the
 * first time either endpoint changes its mind about the type.
 */
function tariffKey(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return null;
}

/**
 * Total of every service on one tariff, in rubles, NET of VAT and AFTER discount.
 *
 * EVERY SERVICE, NOT JUST INSURANCE. We ask for INSURANCE today, but a mandatory
 * service CDEK adds later would otherwise be dropped silently and the card would
 * drift below the invoice again — the exact defect this file exists to close.
 *
 * THE PRICE OF ONE SERVICE IS `total_sum - vat_sum`, NOT `sum`. The spec calls
 * `sum` «Стоимость услуги» and `total_sum` «Стоимость услуги с НДС и скидкой»:
 * `sum` is the figure BEFORE any contract discount, `total_sum` is the one AFTER
 * it and with VAT added, so the difference is what the service actually costs
 * after discount, still net. Taking `sum` would ignore a discount the seller's
 * own contract earns and overstate the card.
 *
 * A SANDBOX TEST CANNOT SHOW THIS. On edu `discount_percent` and `discount_sum`
 * are 0 on every service (MEASURED 13.08, all 24 tariffs), so both formulas
 * return the same 7.5 ₽ there; the two only diverge on a production contract that
 * actually carries a discount. That is why the reasoning is written down here
 * rather than left to be inferred from a passing test.
 *
 * VAT stays out for the same reason as everywhere else: showing prices WITH VAT
 * is a display-layer decision taken for every carrier at once, never inside one
 * adapter (same rule as yandex/express-client.ts:262-268).
 *
 * A missing or empty `services` array is a legitimate answer meaning «no extra
 * cost», not a fault: it yields 0, and the tariff keeps its bare delivery price.
 * A service whose `total_sum` or `vat_sum` is unreadable is different — the
 * tariff leaves the list (see mergeCdekServiceSums). There is deliberately NO
 * fallback to `sum`: quietly reverting to the pre-discount formula is precisely
 * the defect this rule removes, and it would be invisible.
 */
function sumServices(services: unknown): number | null {
  if (services === undefined || services === null) {
    return 0;
  }
  if (!Array.isArray(services)) {
    return null;
  }
  let total = 0;
  for (const entry of services) {
    if (entry === null || typeof entry !== "object") {
      return null;
    }
    const row = entry as Record<string, unknown>;
    const totalSum = readNumber(row.total_sum);
    const vatSum = readNumber(row.vat_sum);
    if (totalSum === null || vatSum === null) {
      return null;
    }
    total += totalSum - vatSum;
  }
  return total;
}

/**
 * Read `tariffAndService` into { tariffCode → service total }.
 *
 * A row whose services cannot be read is OMITTED rather than counted as zero.
 * Zero would be a claim that this tariff costs nothing extra, which is the
 * understatement the slice removes; omitting it makes the tariff unmergeable,
 * and mergeCdekOffersWithServices then drops it from the list entirely.
 */
export function mergeCdekServiceSums(raw: unknown): CdekServiceSums {
  const sums: CdekServiceSums = new Map();
  if (raw === null || typeof raw !== "object") {
    return sums;
  }
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.tariff_codes)) {
    return sums;
  }

  for (const element of record.tariff_codes) {
    if (element === null || typeof element !== "object") {
      continue;
    }
    const row = element as Record<string, unknown>;
    const key = tariffKey(row.tariff_code);
    if (key === null) {
      continue;
    }
    const result =
      row.result !== null && typeof row.result === "object"
        ? (row.result as Record<string, unknown>)
        : null;
    if (result === null) {
      continue;
    }
    const services = sumServices(result.services);
    if (services === null) {
      continue;
    }
    sums.set(key, services);
  }

  return sums;
}

/** One offer as far as this merge is concerned — the neutral shape's price half. */
export type MergeableOffer = {
  offerId: string;
  priceRub: number;
};

/**
 * Add the measured service cost to each offer's price, by tariff code.
 *
 * A TARIFF PRESENT ON ONLY ONE SIDE IS DROPPED, not shown bare. Showing it
 * would put a knowingly-too-low number on the card next to correctly-priced
 * siblings — worse than showing one option fewer, because the seller compares
 * carriers by exactly that number.
 *
 * `offerIdToTariffCode` extracts the code from an offerId (`cdek:136` → `136`);
 * an id that does not parse is dropped for the same reason.
 */
export function mergeCdekOffersWithServices<T extends MergeableOffer>(
  offers: readonly T[],
  serviceSums: CdekServiceSums,
): T[] {
  const merged: T[] = [];
  for (const offer of offers) {
    const match = /^cdek:(.+)$/.exec(offer.offerId.trim());
    if (!match) {
      continue;
    }
    const key = tariffKey(match[1]);
    if (key === null) {
      continue;
    }
    const services = serviceSums.get(key);
    if (services === undefined) {
      continue;
    }
    merged.push({ ...offer, priceRub: offer.priceRub + services });
  }
  return merged;
}
