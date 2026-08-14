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
 * CDEK error codes on a failed tariff row that mean «this parcel is not charged
 * for the service», NOT «the call went wrong».
 *
 * MEASURED 14.08 on the PRODUCTION contract, 38 rows, all with status "false":
 * 37 answered `ve_additional_service_unavailable` («Доп услуга … недоступна» —
 * insurance is not enabled on this contract at all) and one answered
 * `ve_as_insurance_min_declared_cost` («минимальная объявленная стоимость —
 * 3000» against a declared value of 1000 ₽). In both the carrier is telling us
 * there is no fee to add, so the bare tarifflist price is CORRECT, not
 * understated — which is the whole distinction: a call that FAILED is not the
 * same as a service that does not APPLY.
 *
 * EXACT CODES, NEVER A PREFIX OR A SUBSTRING. An unknown code must never
 * silently come to mean «no fee»: that is exactly how a real surcharge would
 * disappear from the card. Anything outside this set drops the tariff.
 */
const FEE_NOT_APPLICABLE_ERROR_CODES = new Set<string>([
  "ve_additional_service_unavailable",
  "ve_as_insurance_min_declared_cost",
]);

const UNKNOWN_TARIFF_ERROR_LOG_MARKER =
  "[mergeCdekServiceSums] UNKNOWN_TARIFF_ERROR_CODE";

/** Every `code` on a failed row's errors[], as exact strings. */
function errorCodesOf(result: Record<string, unknown>): string[] | null {
  const errors = result.errors;
  if (!Array.isArray(errors) || errors.length === 0) {
    return null;
  }
  const codes: string[] = [];
  for (const entry of errors) {
    if (entry === null || typeof entry !== "object") {
      return null;
    }
    const code = (entry as Record<string, unknown>).code;
    if (typeof code !== "string" || code.trim() === "") {
      return null;
    }
    codes.push(code.trim());
  }
  return codes;
}

/**
 * Read `tariffAndService` into { tariffCode → service total }.
 *
 * THE DECISION IS KEYED ON `status`, NOT ON THE ABSENCE OF `services`, and that
 * is the correction this rule exists for. A missing `services` array looks
 * identical on a successful row with no surcharge and on a row that failed — so
 * reading only `services` made EVERY failure, including one whose code we have
 * never seen, quietly mean «no extra cost». Measured: the production reply, all
 * rows failed, and every one of them still produced a price.
 *
 * status "true"  → the row was priced; services are added (empty or absent
 *                  array is an honest zero).
 * status "false" → the row failed; only the two measured «fee does not apply»
 *                  codes keep the bare price, everything else drops the tariff.
 * no status      → unusable; dropped, because guessing is what this fixes.
 *
 * A DROPPED TARIFF IS AN OPTION THE SELLER NEVER SEES, so an unrecognised code
 * is logged with the tariff — otherwise a new CDEK code would announce itself
 * only as offers quietly going missing. Codes only, never the body.
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

    // MEASURED: status arrives as the STRING "true" / "false", not a boolean.
    const status = typeof row.status === "string" ? row.status.trim() : null;
    if (status === null) {
      continue;
    }

    if (status === "false") {
      const codes = errorCodesOf(result);
      if (codes === null) {
        continue;
      }
      const unknown = codes.filter(
        (code) => !FEE_NOT_APPLICABLE_ERROR_CODES.has(code),
      );
      if (unknown.length > 0) {
        console.error(
          UNKNOWN_TARIFF_ERROR_LOG_MARKER,
          JSON.stringify({ tariffCode: key, codes: unknown }),
        );
        continue;
      }
      // Every code says the fee does not apply — the bare price is the right one.
      sums.set(key, 0);
      continue;
    }

    if (status !== "true") {
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
