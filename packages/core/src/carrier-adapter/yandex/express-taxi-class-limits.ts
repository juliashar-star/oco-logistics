/**
 * Express-family taxi classes we quote today.
 * Documented also: cargo, sdd_multislot — not in this slice.
 */
export type ExpressTaxiClass = "courier" | "express";

export type ExpressTaxiClassLimits = {
  maxWeightKg: number;
  maxLengthM: number;
  maxWidthM: number;
  maxHeightM: number;
};

/**
 * Documented Express taxi-class parcel limits (metres / kilograms).
 * Source: https://yandex.ru/support/delivery-profile/ru/api/express/faq
 *   courier ≤10 kg, 0.80×0.50×0.50 m
 *   express ≤20 kg, 1.00×0.60×0.50 m
 *
 * Yandex does NOT enforce these at quote time — measured, a 15 kg parcel
 * still received courier offers — so any filter that uses these limits is
 * ours and deliberate.
 */
export const EXPRESS_TAXI_CLASS_LIMITS: Readonly<
  Record<ExpressTaxiClass, ExpressTaxiClassLimits>
> = {
  courier: {
    maxWeightKg: 10,
    maxLengthM: 0.8,
    maxWidthM: 0.5,
    maxHeightM: 0.5,
  },
  express: {
    maxWeightKg: 20,
    maxLengthM: 1.0,
    maxWidthM: 0.6,
    maxHeightM: 0.5,
  },
};

/**
 * Comparable capacity of a class's limits — higher means wider.
 * Used only as a price-tie breaker when collapsing same-interval offers from
 * one provider: both offers already passed their own class-limit filter, so
 * both will accept the parcel; the survivor is the cheaper option for an
 * identical delivery, and wider limits break an equal-price tie.
 * Explicit product of the documented caps, not registry order.
 */
export function expressTaxiClassCapacity(
  limits: ExpressTaxiClassLimits,
): number {
  return (
    limits.maxWeightKg *
    limits.maxLengthM *
    limits.maxWidthM *
    limits.maxHeightM
  );
}
