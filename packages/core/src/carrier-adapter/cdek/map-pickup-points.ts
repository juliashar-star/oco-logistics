import type {
  CarrierPickupPoint,
  CarrierPickupPointKind,
} from "../types";

/**
 * CDEK office `type` → neutral CarrierPickupPointKind.
 *
 * POSTAMAT → "postamat" is UNVERIFIED on the wire: all 142 Moscow sandbox
 * offices (city_code=44, is_handout=true, measured) are type "PVZ". The branch
 * exists so a real postamat does not become "unknown" the day it appears.
 */
export function mapCdekOfficeTypeToKind(type: unknown): CarrierPickupPointKind {
  if (typeof type !== "string") {
    return "unknown";
  }
  const normalized = type.trim();
  if (normalized === "PVZ") {
    return "pickup_point";
  }
  if (normalized === "POSTAMAT") {
    return "postamat";
  }
  return "unknown";
}

/** True when the office row's status is exactly "ACTIVE". */
export function isActiveOffice(row: unknown): boolean {
  if (row === null || typeof row !== "object") {
    return false;
  }
  return (row as Record<string, unknown>).status === "ACTIVE";
}

/** True when the office row's is_handout is exactly true. */
export function acceptsHandout(row: unknown): boolean {
  if (row === null || typeof row !== "object") {
    return false;
  }
  return (row as Record<string, unknown>).is_handout === true;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function requiredNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Map CDEK /v2/deliverypoints office rows into neutral CarrierPickupPoint[].
 *
 * WHY SKIP RATHER THAN THROW: same reasoning as mapCdekTariffsToOffers — one
 * malformed office must not blank a 142-row Moscow list.
 *
 * schedule is always null: CarrierPickupPointSchedule requires utcOffsetHours,
 * and CDEK work_time_list is only {day, time:"HH:MM/HH:MM"} with no timezone.
 * Inventing an offset (or dropping utcOffsetHours from the neutral type) is
 * out of scope for this slice — do not reshape CarrierPickupPointSchedule here.
 */
export function mapCdekPickupPoints(raw: unknown): CarrierPickupPoint[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const points: CarrierPickupPoint[] = [];
  for (const element of raw) {
    if (element === null || typeof element !== "object") {
      continue;
    }
    const row = element as Record<string, unknown>;

    // LOAD-BEARING: id AND code both come from office `code` (e.g. "MSK65"),
    // never from uuid. The browser DTO drops `code`; the form uses `id` as the
    // <option> value; that value becomes Shipment.pvzCode → delivery_point on
    // POST /v2/orders. Mapping id ← uuid would break order creation.
    const code = requiredNonEmptyString(row.code);
    if (code === null) {
      continue;
    }

    const location =
      row.location !== null && typeof row.location === "object"
        ? (row.location as Record<string, unknown>)
        : null;
    if (location === null) {
      continue;
    }

    const latitude = finiteNumber(location.latitude);
    const longitude = finiteNumber(location.longitude);
    if (latitude === null || longitude === null) {
      continue;
    }

    const name =
      typeof row.name === "string" ? row.name : "";
    const address =
      typeof location.address === "string" ? location.address : "";
    const city =
      typeof location.city === "string" ? location.city : "";

    points.push({
      id: code,
      providerKey: "cdek",
      code,
      name,
      address,
      city,
      latitude,
      longitude,
      kind: mapCdekOfficeTypeToKind(row.type),
      // CDEK has no dark-store concept on the office wire.
      isDarkStore: false,
      deactivationDate: null,
      dayOffs: [],
      // See file-level note: work_time_list cannot fill utcOffsetHours.
      schedule: null,
      rawPoint: element,
    });
  }

  return points;
}
