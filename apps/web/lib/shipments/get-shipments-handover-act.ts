import type { CarrierCredentials, CarrierLabelDocument } from "@oco/core/carrier-adapter/types";
import type { OrderAdapter } from "@oco/core/carrier-adapter/order-adapters";
import { CarrierAuthError } from "@oco/core/carrier-adapter/errors";
import { normalizeShipmentIds } from "./shipment-ids-request";

/**
 * Max shipments on one акт. Yandex documents no limit of its own (and an empty
 * body once returned an act over hundreds of sandbox orders), so this cap is
 * ours and protective: a signed multi-page act is unreadable to review, and an
 * accidental «select all» must not fire a long carrier call. 100 is low
 * hundreds — enough for a real handover wave, small enough to scan before signing.
 */
export const HANDOVER_ACT_SELECTION_LIMIT = 100;

/**
 * Own allow-list for the акт — do NOT reuse isLabelAllowedStatus /
 * LABEL_ALLOWED_STATUSES. The label asks «may a sticker be printed»; the act
 * asks «is this being handed over right now». Merging them would silently
 * put AT_PVZ (label-OK) on a signed handover document, or refuse IN_TRANSIT
 * after a lagging sync while the parcel is still in the seller's hands.
 *
 * IN_TRANSIT is allowed deliberately: status sync can lag, and the seller
 * must still be able to put a physically-present parcel on the act they sign.
 * CANCELED / DELIVERED / RETURNED / … are refused even though Yandex still
 * serves acts for cancelled orders (measured) — that is the hazard this gate
 * exists to prevent.
 */
export const HANDOVER_ACT_ALLOWED_STATUSES: ReadonlySet<string> = new Set([
  "CREATED",
  "IN_TRANSIT",
]);

export type HandoverActShipmentRow = {
  id: string;
  status: string;
  providerOrderId: string | null;
  orderAdapterKey: string | null;
};

export type GetShipmentsHandoverActDeps = {
  /**
   * MUST filter by both ids and companyId — a loader that ignores companyId
   * would leak another company's rows onto a document the seller signs.
   */
  loadShipments: (
    shipmentIds: string[],
    companyId: string,
  ) => Promise<HandoverActShipmentRow[]>;
  getCredentials: (
    companyId: string,
    providerKey: string,
  ) => Promise<
    | { ok: true; credentials: CarrierCredentials }
    | { ok: false; reason: "not_connected" }
  >;
  resolveAdapter: (
    adapterKey: string | null | undefined,
  ) => OrderAdapter;
};

export type GetShipmentsHandoverActResult =
  | { ok: true; document: CarrierLabelDocument }
  | { ok: false; reason: "empty_selection" }
  | {
      ok: false;
      reason: "selection_too_large";
      selected: number;
      limit: number;
    }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "no_carrier_order" }
  | {
      ok: false;
      reason: "not_allowed_for_status";
      shipmentIds: string[];
    }
  | { ok: false; reason: "unsupported_service" }
  | { ok: false; reason: "mixed_services" }
  | { ok: false; reason: "carrier_not_connected" }
  | { ok: false; reason: "carrier_auth" };

/**
 * Fetch one акт приёма-передачи PDF for the selected shipments of companyId.
 *
 * Deps are required (no defaults to prisma / real adapters / network). Any
 * requested id that is missing for this company, or lacks providerOrderId, is
 * a hard refuse — silently dropping a row would produce a document the seller
 * signs that does not match what they selected.
 */
export async function getShipmentsHandoverAct(
  input: { shipmentIds: string[]; companyId: string },
  deps: GetShipmentsHandoverActDeps,
): Promise<GetShipmentsHandoverActResult> {
  // Same trim/dedupe every bulk action uses — see shipment-ids-request.
  const requested = normalizeShipmentIds(input.shipmentIds);
  if (requested.length === 0) {
    return { ok: false, reason: "empty_selection" };
  }
  if (requested.length > HANDOVER_ACT_SELECTION_LIMIT) {
    return {
      ok: false,
      reason: "selection_too_large",
      selected: requested.length,
      limit: HANDOVER_ACT_SELECTION_LIMIT,
    };
  }

  const rows = await deps.loadShipments(requested, input.companyId);
  if (rows.length !== requested.length) {
    return { ok: false, reason: "not_found" };
  }

  for (const row of rows) {
    if (row.providerOrderId == null || row.providerOrderId.trim() === "") {
      return { ok: false, reason: "no_carrier_order" };
    }
  }

  const badStatusIds = rows
    .filter((row) => !HANDOVER_ACT_ALLOWED_STATUSES.has(row.status))
    .map((row) => row.id);
  if (badStatusIds.length > 0) {
    return {
      ok: false,
      reason: "not_allowed_for_status",
      shipmentIds: badStatusIds,
    };
  }

  const adapters = rows.map((row) => deps.resolveAdapter(row.orderAdapterKey));
  const firstKey = adapters[0]!.key;
  for (const adapter of adapters) {
    if (adapter.key !== firstKey) {
      return { ok: false, reason: "mixed_services" };
    }
  }

  const adapter = adapters[0]!;
  if (typeof adapter.getHandoverAct !== "function") {
    return { ok: false, reason: "unsupported_service" };
  }

  const credsResult = await deps.getCredentials(
    input.companyId,
    adapter.providerKey,
  );
  if (!credsResult.ok) {
    return { ok: false, reason: "carrier_not_connected" };
  }

  const providerOrderIds = rows.map((row) => row.providerOrderId!.trim());

  try {
    const document = await adapter.getHandoverAct(
      providerOrderIds,
      credsResult.credentials,
    );
    return { ok: true, document };
  } catch (error) {
    if (error instanceof CarrierAuthError) {
      return { ok: false, reason: "carrier_auth" };
    }
    throw error;
  }
}
