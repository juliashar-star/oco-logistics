import type { CarrierConfirmWarning } from "@oco/core/carrier-adapter/types";

const KNOWN: ReadonlySet<string> = new Set<CarrierConfirmWarning>([
  "REQUIREMENT_UNMET",
  "PARCEL_MAY_NOT_FIT",
  "ADDRESS_NOT_FOUND",
  "ADDRESS_COORDINATE_MISMATCH",
  "UNKNOWN",
]);

function isConfirmWarning(value: unknown): value is CarrierConfirmWarning {
  return typeof value === "string" && KNOWN.has(value);
}

/** Defensive parse of submit success `warnings` — unknown entries dropped. */
export function parseSubmitConfirmWarnings(
  body: unknown,
): CarrierConfirmWarning[] {
  if (body === null || typeof body !== "object") {
    return [];
  }
  const raw = (body as { warnings?: unknown }).warnings;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(isConfirmWarning);
}
