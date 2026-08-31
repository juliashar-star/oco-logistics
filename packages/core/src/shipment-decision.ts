import {
  offerDeadlineWithBasis,
  type OfferDeadlineBasis,
} from "./carrier-adapter/offer-deadline";

/**
 * What was chosen at submit, out of what, and by which rules — computed as a
 * PURE function so a unit test reaches it in milliseconds. The database write
 * lives in apps/web; nothing here touches Prisma, the network or the clock.
 *
 * WHY A SNAPSHOT AND NOT A QUERY. The offers list is overwritten on every
 * re-quote and the Shipment row is editable afterwards, so «what was the seller
 * shown» is answerable only if it is written down at the moment of the choice.
 * Recomputing it later reads a different list.
 */

/**
 * Bumped when the RULES below change — not when this file is edited. A stored
 * row keeps the version that produced it, so old rows stay readable instead of
 * being reinterpreted under rules they never saw.
 */
export const RULES_VERSION = 1;

/**
 * Mirrors the DeadlineBasis enum in schema.prisma. Aliased from the offers
 * module rather than declared again: the values must stay identical, and two
 * declarations are how they would stop being.
 */
export type DeadlineBasis = OfferDeadlineBasis;

/**
 * Deliberately `unknown` per field. The input is a JSON blob read back from
 * Shipment.quotedOffers, written by older code under older shapes; declaring it
 * as CarrierOffer would be a claim about data we did not validate. Every reader
 * below narrows before use, which is what lets this function never throw.
 */
export type DecisionOfferInput = {
  offerId?: unknown;
  adapterKey?: unknown;
  serviceName?: unknown;
  priceRub?: unknown;
  priceIsEstimate?: unknown;
  deliveryDayFrom?: unknown;
  deliveryDayTo?: unknown;
  deliveryIntervalFrom?: unknown;
  deliveryIntervalTo?: unknown;
};

export type BuildShipmentDecisionArgs = {
  offers: unknown;
  selectedOfferId: unknown;
  rulesVersion: number;
  now: Date;
};

/**
 * Calendar days are carried as `YYYY-MM-DD` STRINGS, never as Date. The column
 * is `@db.Date` and the comparison is between calendar days; constructing a
 * Date here would attach a time zone and could shift the day by one across a
 * boundary — the exact failure the column type was chosen to avoid. The
 * persistence layer converts once, at the edge.
 */
export type ShipmentDecisionRecord = {
  rulesVersion: number;
  decidedAt: Date;
  chosenAdapterKey: string;
  chosenServiceName: string | null;
  chosenPriceKop: number;
  chosenPriceIsEstimate: boolean;
  chosenDeadlineDay: string | null;
  chosenDeadlineBasis: DeadlineBasis | null;
  altAdapterKey: string | null;
  altPriceKop: number | null;
  altPriceIsEstimate: boolean | null;
  altDeadlineDay: string | null;
  offersTotal: number;
  carriersTotal: number;
  attributionComplete: boolean;
};

/**
 * Why a failure is a RESULT and not an exception, and not a record full of
 * nulls either: three columns are NOT NULL (chosenAdapterKey, chosenPriceKop,
 * chosenPriceIsEstimate), so a decision that cannot name what was chosen is not
 * a row that can be written. The caller must skip the write, not write a
 * half-row that later reads as a real measurement.
 */
export type BuildShipmentDecisionFailure =
  | "offers_not_an_array"
  | "offers_empty"
  | "selected_offer_not_found"
  | "selected_offer_has_no_adapter_key"
  | "selected_offer_has_no_price";

export type BuildShipmentDecisionResult =
  | { ok: true; decision: ShipmentDecisionRecord }
  | { ok: false; reason: BuildShipmentDecisionFailure };

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

type OfferDeadline = { day: string; basis: DeadlineBasis };

/**
 * THE DAY COMES FROM THE OFFERS SCREEN'S OWN CODE, not from a second copy of
 * the rule. `offerDeadlineWithBasis` is the same function the list order and
 * the badges resolve their day with, so a stored decision can never name a day
 * the seller was not shown — which is the whole point of storing it.
 *
 * This module therefore has NO precedence of its own. An earlier revision did,
 * in the opposite order, and carried a comment admitting the divergence; the
 * comment is gone because the divergence is.
 *
 * Note what the shared reader does NOT look at: `deliveryIntervalFrom`. The
 * screen reads only the late edge of an interval, and measured on 310 stored
 * offers not one carries a start without an end, so nothing is lost today.
 */
function offerDeadline(offer: DecisionOfferInput): OfferDeadline | null {
  const deadline = offerDeadlineWithBasis({
    deliveryIntervalTo:
      typeof offer.deliveryIntervalTo === "string"
        ? offer.deliveryIntervalTo
        : null,
    deliveryDayTo:
      typeof offer.deliveryDayTo === "string" ? offer.deliveryDayTo : null,
    deliveryDayFrom:
      typeof offer.deliveryDayFrom === "string" ? offer.deliveryDayFrom : null,
  });
  if (deadline === null) {
    return null;
  }
  return { day: deadline.dayKey, basis: deadline.basis };
}

function asOfferArray(value: unknown): DecisionOfferInput[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value.map((item) =>
    item !== null && typeof item === "object" ? (item as DecisionOfferInput) : {},
  );
}

/**
 * Never throws. Unknown shapes, a blank list and a selectedOfferId that matches
 * nothing all come back as `{ ok: false }` with a named reason; missing OPTIONAL
 * values inside an otherwise usable offer come back as null fields.
 */
export function buildShipmentDecision(
  args: BuildShipmentDecisionArgs,
): BuildShipmentDecisionResult {
  const offers = asOfferArray(args.offers);
  if (offers === null) {
    return { ok: false, reason: "offers_not_an_array" };
  }
  if (offers.length === 0) {
    return { ok: false, reason: "offers_empty" };
  }

  const selectedOfferId = readTrimmedString(args.selectedOfferId);
  const chosenIndex = offers.findIndex(
    (offer) =>
      selectedOfferId !== "" &&
      readTrimmedString(offer.offerId) === selectedOfferId,
  );
  if (chosenIndex === -1) {
    return { ok: false, reason: "selected_offer_not_found" };
  }

  const chosen = offers[chosenIndex];

  const chosenAdapterKey = readTrimmedString(chosen.adapterKey);
  if (chosenAdapterKey === "") {
    return { ok: false, reason: "selected_offer_has_no_adapter_key" };
  }

  const chosenPrice = readFiniteNumber(chosen.priceRub);
  if (chosenPrice === null) {
    return { ok: false, reason: "selected_offer_has_no_price" };
  }

  const chosenDeadline = offerDeadline(chosen);

  /**
   * THE ALTERNATIVE: cheapest offer that was no later and strictly cheaper.
   *
   * «Strictly» is what makes an equal price no alternative at all — a seller who
   * paid the same for the same day gave nothing up, and calling that an
   * alternative would manufacture a regret that did not happen.
   *
   * A missing day on EITHER side disqualifies the pair rather than being
   * treated as «no constraint». «No later» is not decidable without both days,
   * and guessing in the permissive direction would invent an alternative the
   * comparison cannot support.
   */
  let altIndex = -1;
  let altPrice: number | null = null;
  if (chosenDeadline !== null) {
    for (let i = 0; i < offers.length; i += 1) {
      if (i === chosenIndex) {
        continue;
      }
      const candidate = offers[i];
      if (readTrimmedString(candidate.offerId) === selectedOfferId) {
        continue;
      }
      const price = readFiniteNumber(candidate.priceRub);
      if (price === null || price >= chosenPrice) {
        continue;
      }
      const deadline = offerDeadline(candidate);
      if (deadline === null || deadline.day > chosenDeadline.day) {
        continue;
      }
      // Ties on the cheapest price keep the FIRST in list order: the list the
      // seller saw is the only ordering available here, and picking «any» would
      // make the record non-deterministic for identical input.
      if (altPrice === null || price < altPrice) {
        altPrice = price;
        altIndex = i;
      }
    }
  }

  const alt = altIndex === -1 ? null : offers[altIndex];
  const altDeadline = alt === null ? null : offerDeadline(alt);
  const altAdapterKey = alt === null ? "" : readTrimmedString(alt.adapterKey);

  const adapterKeys = new Set<string>();
  let everyOfferAttributed = true;
  for (const offer of offers) {
    const key = readTrimmedString(offer.adapterKey);
    if (key === "") {
      everyOfferAttributed = false;
    } else {
      adapterKeys.add(key);
    }
  }

  const chosenServiceName = readTrimmedString(chosen.serviceName);

  return {
    ok: true,
    decision: {
      rulesVersion: args.rulesVersion,
      decidedAt: args.now,
      chosenAdapterKey,
      chosenServiceName: chosenServiceName === "" ? null : chosenServiceName,
      // KOPECKS, matching Shipment.plannedCost, so the two can be compared
      // without a lossy conversion standing between them. CarrierOffer.priceRub
      // is in rubles and may be fractional, hence the ×100 before rounding.
      chosenPriceKop: Math.round(chosenPrice * 100),
      // Absent means «firm» — the same reading the offer type gives it.
      chosenPriceIsEstimate: chosen.priceIsEstimate === true,
      chosenDeadlineDay: chosenDeadline === null ? null : chosenDeadline.day,
      chosenDeadlineBasis: chosenDeadline === null ? null : chosenDeadline.basis,
      // All four alt fields are null together, by construction: they describe
      // one offer or no offer.
      altAdapterKey: altAdapterKey === "" ? null : altAdapterKey,
      altPriceKop: altPrice === null ? null : Math.round(altPrice * 100),
      // NULL, not false, when there is no alternative — see the field comment
      // in schema.prisma. false would assert «firm» about an offer that does
      // not exist.
      altPriceIsEstimate: alt === null ? null : alt.priceIsEstimate === true,
      altDeadlineDay: altDeadline === null ? null : altDeadline.day,
      // Length AS IS. Duplicate calendar-day cards are a separate open problem
      // and are deliberately not deduplicated here — a decision record that
      // quietly counted differently from the screen would be worse than one
      // that counts what was on it.
      offersTotal: offers.length,
      carriersTotal: adapterKeys.size,
      attributionComplete: everyOfferAttributed,
    },
  };
}
