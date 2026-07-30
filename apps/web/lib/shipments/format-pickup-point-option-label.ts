import type { CarrierPickupPointKind } from "@oco/core/carrier-adapter/types";

/**
 * Seller-facing <option> label for a pickup point.
 * Постамат / склад get an explicit prefix; plain pickup_point (and unknown)
 * keep «name — address» unchanged when not a darkstore.
 *
 * Darkstore is a MARK, not a kind: Yandex docs only say «Признак даркстора»
 * and nothing about whether a buyer may collect there. Trade meaning is a
 * warehouse closed to walk-in shoppers, but some darkstores also serve as
 * pickup points — so we must not imply «buyer cannot collect».
 *
 * The mark leads, attached to the kind word — never trails. A plain <select>
 * truncates long options by control width; a trailing mark is the first thing
 * lost, exactly on long addresses. Leading survives; beside the real kind it
 * cannot be misread as a third venue kind. pickup_point gets «Пункт выдачи»
 * only when marked (the mark needs a word to qualify); non-darkstore
 * pickup_point stays unprefixed.
 */
export function formatPickupPointOptionLabel(point: {
  kind: CarrierPickupPointKind;
  name: string;
  address: string;
  isDarkStore?: boolean;
}): string {
  const base = `${point.name} — ${point.address}`;
  const dark = point.isDarkStore === true;

  if (point.kind === "postamat") {
    return dark ? `Постамат (даркстор) — ${base}` : `Постамат — ${base}`;
  }
  if (point.kind === "warehouse") {
    return dark ? `Склад (даркстор) — ${base}` : `Склад — ${base}`;
  }
  if (dark && point.kind === "pickup_point") {
    return `Пункт выдачи (даркстор) — ${base}`;
  }
  if (dark) {
    // unknown (or any other non-prefixed kind): bare word — no real kind to qualify.
    return `Даркстор — ${base}`;
  }
  return base;
}
