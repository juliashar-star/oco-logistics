import type { CarrierConfirmWarning } from "../types";

/**
 * Map Yandex claims/info `warnings` into neutral codes.
 *
 * Never read `message`: provider text can echo submitted fields (PII). Only
 * `code` is used; wording for the seller is ours, elsewhere.
 *
 * UNKNOWN: the documented code set is closed today (four members). A fifth
 * code Yandex adds later must be recorded, not silently dropped.
 *
 * Malformed input never throws — confirm already succeeded / the order exists.
 */
export function parseClaimWarnings(
  rawWarnings: unknown,
): CarrierConfirmWarning[] {
  if (!Array.isArray(rawWarnings)) {
    return [];
  }

  const out: CarrierConfirmWarning[] = [];
  for (const entry of rawWarnings) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const code = (entry as { code?: unknown }).code;
    if (typeof code !== "string" || !code) {
      continue;
    }
    out.push(mapYandexWarningCode(code));
  }
  return out;
}

function mapYandexWarningCode(code: string): CarrierConfirmWarning {
  switch (code) {
    case "requirement_unavailable":
      return "REQUIREMENT_UNMET";
    case "not_fit_in_car":
      return "PARCEL_MAY_NOT_FIT";
    case "address_not_found":
      return "ADDRESS_NOT_FOUND";
    case "address_too_far":
      return "ADDRESS_COORDINATE_MISMATCH";
    default:
      return "UNKNOWN";
  }
}

/** Concatenate lists, drop duplicates, keep first-seen order. */
export function mergeClaimWarnings(
  ...lists: CarrierConfirmWarning[][]
): CarrierConfirmWarning[] {
  const seen = new Set<CarrierConfirmWarning>();
  const out: CarrierConfirmWarning[] = [];
  for (const list of lists) {
    for (const code of list) {
      if (seen.has(code)) {
        continue;
      }
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}
