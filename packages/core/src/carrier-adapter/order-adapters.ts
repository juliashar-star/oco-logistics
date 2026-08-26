import type { CarrierAdapter } from "./types";
import {
  FREE_CANCEL_BOUNDARY_UNKNOWN,
  FREE_CANCEL_UNTIL_COURIER_PICKUP,
  FREE_CANCEL_UNTIL_WAREHOUSE_INTAKE,
  type FreeCancelBoundary,
} from "./free-cancel-boundaries";
import {
  cancelCdekOrder,
  confirmOffer as cdekConfirmOffer,
  getOffers as cdekGetOffers,
} from "./cdek/client";
import { orderAdapterSellerTitle } from "./order-adapter-seller-titles";
import { yandexAdapter } from "./yandex/adapter";
import {
  cancelExpressOrder,
  confirmExpressOffer,
  getExpressOffers,
} from "./yandex/express-client";
import {
  EXPRESS_TAXI_CLASS_LIMITS,
  expressTaxiClassCapacity,
  expressTaxiClassParcelLimits,
} from "./yandex/express-taxi-class-limits";
import type { ServiceParcelLimits } from "./parcel-fits-service-limits";

/**
 * Order-path capability only — not a full CarrierAdapter.
 * Call sites that need getOffers / confirmOffer / cancelOrder resolve by
 * composite key here instead of hardcoding a carrier module.
 *
 * The key is composite because one carrier can expose several API families
 * (Yandex «в другой день» vs Express claims/*), while credentials are per
 * carrier, not per service. providerKey on the entry is what
 * getCarrierCredentials looks up.
 *
 * title comes from order-adapter-seller-titles (seller display metadata) so
 * client code can resolve a label without importing this registry.
 */
export type OrderAdapter = {
  key: string;
  providerKey: string;
  /**
   * Seller-facing name of the SERVICE.
   * Descriptive wording on purpose — not the carrier's own product name,
   * which is covered by the display-name masking in provider-seller-display-names.
   */
  title: string;
  /**
   * Comparable capacity of this service's parcel limits (higher = wider).
   * Fed to same-provider same-interval dedupe as a price-tie breaker —
   * not "whichever entry came first in the registry". Absent on families
   * without rated Express-class caps (e.g. next_day).
   */
  offerLimitCapacity?: number;
  /**
   * What this SERVICE will carry. Compared against the parcel ONCE, in the
   * fan-out, so the rule is written here as data rather than repeated inside
   * each adapter.
   *
   * ABSENT MEANS «NO SOURCED NUMBER», NOT «NO LIMIT», and an absent entry is
   * never filtered. Every number below carries its source and its verification
   * date in a comment, and a service whose limits we cannot cite stays
   * unfiltered on purpose: a parcel wrongly dropped shows the seller a service
   * named as refusing, with nothing on screen saying why.
   */
  parcelLimits?: ServiceParcelLimits;
  /**
   * Apply `parcelLimits` ONLY when the destination is a pickup point.
   *
   * Exists for `yataxi:next_day`, whose numbers are sourced to the ПВЗ variant
   * in the registry — «лимит … для ПВЗ Яндекс Маркета и партнёров». Whether the
   * same caps hold for a COURIER destination of that service is НЕ УСТАНОВЛЕНО,
   * so the courier branch is left unfiltered. That is a deliberate hole, not an
   * oversight: carrying a point limit to a door delivery would be an assumption,
   * and a false drop costs the seller an option they could have bought.
   */
  parcelLimitsPointOnly?: boolean;
  /**
   * Whether this SERVICE can deliver to a pickup point at all.
   *
   * `false` on the Express family, and it is a SCHEMA fact, not a measurement:
   * the claims calculate route point has no platform_station / point-id field,
   * so a pickup-point destination cannot be expressed in the request at all.
   *
   * Read by the fan-out only to ORDER two refusals — see the comment on
   * adapterAcceptsParcel. Absent means «no reason to think otherwise», which is
   * why only the two entries that genuinely cannot are marked.
   */
  servesPointDestination?: boolean;
  /**
   * Whether this SERVICE can carry a thermal bag.
   * Same optional shape as offerLimitCapacity. True on Express-family
   * entries; absent/false on next_day — the other-day (request/*) family
   * documents no thermal / temperature / insulated-bag option at all.
   */
  supportsThermalBag?: boolean;
  /**
   * When free cancellation stops being possible for this SERVICE, as a neutral
   * key — the words a seller reads are built in the UI layer, like
   * supportsThermalBag and «без термосумки».
   *
   * Optional in the type, like the two fields above, but a consistency test
   * asserts the KEY IS PRESENT on every entry: the resolver defaults an absent
   * one to "unknown", so a new carrier that forgot it would quietly ship the
   * vaguest warning instead of the true one, and nothing would say so.
   */
  freeCancelBoundary?: FreeCancelBoundary;
  getOffers: CarrierAdapter["getOffers"];
  confirmOffer: CarrierAdapter["confirmOffer"];
  cancelOrder: CarrierAdapter["cancelOrder"];
  /**
   * Optional: shipping-label PDF. Absent on families with no label method
   * (e.g. Express claims/*). Looked up by orderAdapterKey — never by
   * providerKey alone (next_day and express share "yataxi").
   */
  generateLabels?: CarrierAdapter["generateLabels"];
  /**
   * Optional: акт приёма-передачи PDF. Other-day only today; Express has none.
   * Looked up by orderAdapterKey — never by providerKey alone.
   */
  getHandoverAct?: CarrierAdapter["getHandoverAct"];
};

export const ORDER_ADAPTERS: Record<string, OrderAdapter> = {
  "yataxi:next_day": {
    key: "yataxi:next_day",
    providerKey: yandexAdapter.providerKey,
    title: orderAdapterSellerTitle("yataxi:next_day"),
    // No supportsThermalBag — other-day (request/*) documents no thermal
    // option (method index + create/calculate bodies). Marked on the card
    // when the seller asked for a bag; not hidden from the list.
    //
    // NOT MEASURED, and set explicitly rather than left absent. The request/*
    // documentation names no point at which cancelling starts costing money,
    // and we have run no probe for it — so the seller is told the boundary is
    // unknown instead of being left to assume the Express rule applies.
    freeCancelBoundary: FREE_CANCEL_BOUNDARY_UNKNOWN,
    // Source: https://yandex.ru/support/delivery-profile/ru/other-day/weight-limits
    // verifiedAt 2026-07-08, via the `pvz` variant in carrier-picker/registry.ts.
    // ПВЗ ONLY — see parcelLimitsPointOnly. The registry note is explicit that
    // these are the per-box caps for ПВЗ Яндекс Маркета и партнёров, and that
    // the whole-order allowance is wider (200 kg / 300 cm side / 500 cm sum);
    // the per-box numbers are the right ones for one parcel.
    parcelLimits: {
      maxWeightKg: 30,
      maxLongestSideCm: 150,
      maxSumThreeSidesCm: 300,
    },
    parcelLimitsPointOnly: true,
    getOffers: yandexAdapter.getOffers,
    confirmOffer: yandexAdapter.confirmOffer,
    cancelOrder: yandexAdapter.cancelOrder,
    generateLabels: yandexAdapter.generateLabels,
    getHandoverAct: yandexAdapter.getHandoverAct,
  },
  "yataxi:express": {
    key: "yataxi:express",
    providerKey: yandexAdapter.providerKey,
    title: orderAdapterSellerTitle("yataxi:express"),
    offerLimitCapacity: expressTaxiClassCapacity(
      EXPRESS_TAXI_CLASS_LIMITS.express,
    ),
    // Source: https://yandex.ru/support/delivery-profile/ru/api/express/faq
    // (quoted in express-taxi-class-limits.ts). Derived from the same constant
    // the adapter's own filter uses, so the two cannot drift apart.
    parcelLimits: expressTaxiClassParcelLimits(EXPRESS_TAXI_CLASS_LIMITS.express),
    // Schema fact — see the field's comment and getExpressOffers.
    servesPointDestination: false,
    supportsThermalBag: true,
    getOffers: (input, credentials) =>
      getExpressOffers(input, credentials, "express"),
    // Same as getOffers: registry supplies the entry's taxi class.
    confirmOffer: (offer, input, credentials) =>
      confirmExpressOffer(offer, input, credentials, "express"),
    // Cancelling an ACCEPTED order can be PAID, so exposing it to a seller
    // without warning is a product decision, not a mapping. That is now the
    // reason cancelExpressOrder is conservative rather than the reason there is
    // no cancel: it asks cancel-info first and refuses anything but "free".
    cancelOrder: cancelExpressOrder,
    // The same rule cancelExpressOrder enforces, said to the seller in advance:
    // claims/cancel-info answers "free" only until the courier reaches the
    // sender, and after that ОСО refuses rather than spend their money.
    freeCancelBoundary: FREE_CANCEL_UNTIL_COURIER_PICKUP,
    // No generateLabels / getHandoverAct — Express claims/* has neither.
  },
  "yataxi:courier": {
    key: "yataxi:courier",
    providerKey: yandexAdapter.providerKey,
    title: orderAdapterSellerTitle("yataxi:courier"),
    offerLimitCapacity: expressTaxiClassCapacity(
      EXPRESS_TAXI_CLASS_LIMITS.courier,
    ),
    // Same source and same derivation as the express entry above.
    parcelLimits: expressTaxiClassParcelLimits(EXPRESS_TAXI_CLASS_LIMITS.courier),
    // Same schema fact as the express entry above.
    servesPointDestination: false,
    supportsThermalBag: true,
    getOffers: (input, credentials) =>
      getExpressOffers(input, credentials, "courier"),
    confirmOffer: (offer, input, credentials) =>
      confirmExpressOffer(offer, input, credentials, "courier"),
    // Same free-only rule as express — see the comment on that entry.
    cancelOrder: cancelExpressOrder,
    freeCancelBoundary: FREE_CANCEL_UNTIL_COURIER_PICKUP,
  },
  "cdek:delivery": {
    key: "cdek:delivery",
    providerKey: "cdek",
    title: orderAdapterSellerTitle("cdek:delivery"),
    // No offerLimitCapacity ON PURPOSE: CDEK offers carry blank delivery
    // intervals, so they all share one dedupe key, and the unrated-capacity
    // branch is what keeps all of them. Adding a capacity here would collapse
    // the whole CDEK list to its cheapest row.
    //
    // WEIGHT ONLY, AND THAT IS THE WHOLE SOURCED TRUTH.
    // Source: https://www.cdek.ru/ru/online-stores/tariffs/ verifiedAt
    // 2026-07-08, via carrier-picker/registry.ts. CDEK dimension caps appear
    // NOWHERE in this repository — not in the registry, not in docs/research —
    // so none are declared and CDEK is not filtered on geometry at all.
    //
    // 50 kg is the CARRIER maximum, not a tariff's. One tarifflist call returns
    // many tariffs and this number is the widest of them, so a parcel between
    // the narrowest tariff's cap and 50 kg still gets quoted at tariffs that
    // will refuse it. Per-tariff caps are not in the repository either.
    parcelLimits: { maxWeightKg: 50 },
    getOffers: cdekGetOffers,
    confirmOffer: cdekConfirmOffer,
    // THE FREE/PAID RULE HERE IS OURS, not the carrier's. CDEK has no
    // cancel-info: nothing in its API will say what an undo would cost. So
    // cancelCdekOrder draws the line from the status boundary in «Приложение 1»
    // — DELETE while the goods have not reached the sender's warehouse, and
    // refuse otherwise rather than fall through to the chargeable refusal.
    cancelOrder: cancelCdekOrder,
    // The «Приложение 1» boundary cancelCdekOrder already enforces, told to the
    // seller before they commit rather than discovered when the button refuses.
    freeCancelBoundary: FREE_CANCEL_UNTIL_WAREHOUSE_INTAKE,
  },
};

/**
 * Fallback for absent/unknown orderAdapterKey (pre-adapterKey quotes, bad keys).
 * Grep anchor when a real service selector lands.
 */
export const DEFAULT_ORDER_ADAPTER = ORDER_ADAPTERS["yataxi:next_day"];

/**
 * OWN keys only. A plain `ORDER_ADAPTERS[key]` walks the prototype chain, so
 * "constructor", "toString", "__proto__" and "valueOf" each returned a truthy
 * Object.prototype member instead of undefined (measured). That defeated both
 * callers at once: the strict lookup's `=== null` was false, and the defaulting
 * one never reached its fallback because the member was not undefined. Fixed
 * here rather than at either caller so there is one place to get it right.
 */
export function getOrderAdapter(key: string): OrderAdapter | undefined {
  return Object.hasOwn(ORDER_ADAPTERS, key) ? ORDER_ADAPTERS[key] : undefined;
}

/**
 * Resolve an ORDER_ADAPTERS entry for submit/cancel.
 * Absent or unknown key → DEFAULT_ORDER_ADAPTER (keeps pre-adapterKey quotes working).
 * getOrderAdapter stays string-only; this helper is the honest optional path.
 */
export function resolveOrderAdapter(
  adapterKey: string | null | undefined,
): OrderAdapter {
  if (adapterKey == null || adapterKey === "") {
    return DEFAULT_ORDER_ADAPTER;
  }
  const found = getOrderAdapter(adapterKey);
  if (found === undefined) {
    console.error(
      "[order-adapters] UNKNOWN_ORDER_ADAPTER_KEY",
      JSON.stringify({ adapterKey }),
    );
    return DEFAULT_ORDER_ADAPTER;
  }
  return found;
}

/**
 * Same lookup, but NEVER defaulting — null for a null, empty or unknown key.
 * A destructive call must not guess a carrier: defaulting here would send a
 * cancel for an unidentifiable shipment to Yandex, which is a write to the
 * wrong provider's account and cannot be undone by reading anything back.
 */
export function resolveOrderAdapterStrict(
  adapterKey: string | null | undefined,
): OrderAdapter | null {
  if (adapterKey == null || adapterKey === "") {
    return null;
  }
  return getOrderAdapter(adapterKey) ?? null;
}
