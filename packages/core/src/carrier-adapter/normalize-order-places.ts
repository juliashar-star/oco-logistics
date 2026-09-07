import type {
  CarrierCreateOrderInput,
  CarrierOrderItem,
} from "./types";

/**
 * One place as the adapters need it: a number unique within the order, the
 * weight, the dimensions the SELLER declared (absent when they did not), and
 * the items lying in it, each carrying its order-wide position index.
 */
export type NormalizedOrderPlace = {
  /** 1..N, unique within the order — Приложение №3 п. 4.1 requires it on the label. */
  number: number;
  weightG: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  items: NormalizedOrderPlaceItem[];
};

export type NormalizedOrderPlaceItem = {
  item: CarrierOrderItem;
  /**
   * Position index across the WHOLE order, 1-based — not within the place.
   * ware_key identifies a product line, and two lines in different places must
   * not collide. The contract says nothing about ware_key uniqueness (searched
   * contracts/, no occurrences), so this is ours to decide, and it is decided
   * independently of the place number.
   */
  positionIndex: number;
};

/**
 * ONE SHAPE FOR BOTH BRANCHES. When `places` is absent the result is a single
 * place built exactly as the adapters built it inline before, so a body sent
 * for a one-box order is unchanged down to the bit.
 *
 * WHAT THIS DOES NOT DECIDE: how a declared value is split across places. It is
 * not split. Регламент п. 8.2 gives ONE declared value per накладная, and CDEK
 * apportions compensation across places itself, in proportion to the paid weight
 * of the lost part. Callers that need the order's declared value sum the item
 * costs; they do not divide anything per place.
 */
export function normalizeOrderPlaces(
  input: CarrierCreateOrderInput,
): NormalizedOrderPlace[] {
  let positionIndex = 0;
  const nextItems = (items: CarrierOrderItem[]): NormalizedOrderPlaceItem[] =>
    items.map((item) => {
      positionIndex += 1;
      return { item, positionIndex };
    });

  if (input.places !== undefined && input.places.length > 0) {
    return input.places.map((place, index) => {
      const normalized: NormalizedOrderPlace = {
        number: index + 1,
        weightG: place.weightG,
        items: nextItems(place.items),
      };
      // The seller's own numbers only. We do NOT fall back to measuring the
      // items when a dimension is absent: п. 2.2.3.1 Регламента lets CDEK
      // recompute the average weight across the whole period and apply it
      // retroactively once dimensions are wrong on more than 3% of shipments,
      // and that recalculation lands in the SELLER'S УПД, not in our report.
      // An absent dimension is an absent dimension.
      if (place.lengthCm !== undefined) normalized.lengthCm = place.lengthCm;
      if (place.widthCm !== undefined) normalized.widthCm = place.widthCm;
      if (place.heightCm !== undefined) normalized.heightCm = place.heightCm;
      return normalized;
    });
  }

  // No places declared: the single synthetic place the adapters used to build
  // inline from items[0]. Same field-by-field result, same omissions.
  const first = input.items[0];
  if (first === undefined) {
    return [];
  }
  const normalized: NormalizedOrderPlace = {
    number: 1,
    weightG: first.weightG,
    items: nextItems([first]),
  };
  if (first.lengthCm !== undefined) normalized.lengthCm = first.lengthCm;
  if (first.widthCm !== undefined) normalized.widthCm = first.widthCm;
  if (first.heightCm !== undefined) normalized.heightCm = first.heightCm;
  return [normalized];
}
