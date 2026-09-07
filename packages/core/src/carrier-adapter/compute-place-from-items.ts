import type { CarrierOrderItem } from "./types";

/**
 * Weight and dimensions of the ONE place OCO builds from a list of items,
 * extracted verbatim from buildPlatformOrderBody with no change in behaviour.
 *
 * This arithmetic is only correct when the items nest inside one another —
 * fixing it is a separate slice.
 */
export function computePlaceFromItems(items: CarrierOrderItem[]): {
  weightG: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
} {
  return {
    weightG: items.reduce((sum, item) => sum + item.weightG * item.quantity, 0),
    lengthCm: Math.max(...items.map((item) => item.lengthCm ?? 1)),
    widthCm: Math.max(...items.map((item) => item.widthCm ?? 1)),
    heightCm: Math.max(...items.map((item) => item.heightCm ?? 1)),
  };
}
