import type { CarrierCredentials } from "@oco/core/carrier-adapter/types";

/**
 * What actually goes in the POST body: only the fields the seller supplied.
 *
 * A field they left alone must be ABSENT from the body, never present as an
 * empty string. The service merges the submission over the stored bag, and an
 * empty string is a supplied value there — sending one would ask the carrier to
 * verify a blank token and, on an accepted verdict, write it into the row.
 * Omission is what makes «оставьте пустым, чтобы не менять» true end to end.
 *
 * Whitespace is not a value: a field holding only spaces is left out too.
 *
 * PURE, so what leaves the browser is one testable decision.
 */
export function pickSuppliedCredentials(
  values: Readonly<Record<string, string>>,
): CarrierCredentials {
  const supplied: CarrierCredentials = {};

  for (const [name, value] of Object.entries(values)) {
    if (typeof value !== "string" || value.trim() === "") {
      continue;
    }
    // defineProperty, not assignment: a field named "__proto__" would otherwise
    // run the prototype setter instead of becoming a key.
    Object.defineProperty(supplied, name, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  return supplied;
}
