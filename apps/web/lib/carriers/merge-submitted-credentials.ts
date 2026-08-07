import type { CarrierCredentials } from "@oco/core/carrier-adapter/types";

/**
 * The bag to validate, verify and store: what is stored, with what the seller
 * actually supplied laid over it.
 *
 * The card tells a connected seller that an empty field keeps the current value,
 * so a field they did not fill must NOT reach the carrier as an empty string —
 * that would wipe a working credential on the next accepted verdict.
 *
 * "Supplied" means a non-blank string. Absent and blank are the same thing here:
 * the seller left it alone.
 *
 * ASYMMETRY, on purpose:
 * - the SUBMITTED map is filtered to `allowedFieldNames`. It comes from a
 *   browser, and the route's schema accepts any key, so an unlisted key must not
 *   be able to enter the bag — it would otherwise be encrypted into the row and
 *   sent to the carrier during verification. Iterating the allow-list rather
 *   than the submission is what makes that impossible rather than merely
 *   checked.
 * - the STORED bag is NOT filtered. Its keys got there through a trusted path,
 *   and a field this build does not know about may be one an older or newer
 *   build does. Dropping it here would silently destroy data.
 *
 * PURE, so the merge rule is one testable decision.
 */
export function mergeSubmittedCredentials(
  stored: Readonly<CarrierCredentials>,
  submitted: Readonly<CarrierCredentials>,
  allowedFieldNames: readonly string[],
): CarrierCredentials {
  const merged: CarrierCredentials = { ...stored };

  for (const name of allowedFieldNames) {
    if (!Object.prototype.hasOwnProperty.call(submitted, name)) {
      continue;
    }
    const value = submitted[name];
    if (typeof value !== "string" || value.trim() === "") {
      continue;
    }
    // defineProperty, not `merged[name] = value`: a field named "__proto__"
    // would otherwise run the prototype setter instead of adding a field.
    Object.defineProperty(merged, name, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  return merged;
}
