import type { CarrierCredentials, CarrierLabelDocument } from "@oco/core/carrier-adapter/types";
import type { OrderAdapter } from "@oco/core/carrier-adapter/order-adapters";
import {
  CarrierAuthError,
  CarrierLabelsNotReadyError,
} from "@oco/core/carrier-adapter/errors";
import { isLabelAllowedStatus } from "@oco/core/carrier-adapter/order-adapter-label-support";

export type ShipmentLabelRow = {
  id: string;
  status: string;
  providerOrderId: string | null;
  orderAdapterKey: string | null;
};

export type GetShipmentLabelDeps = {
  loadShipment: (
    shipmentId: string,
    companyId: string,
  ) => Promise<ShipmentLabelRow | null>;
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

export type GetShipmentLabelResult =
  | { ok: true; document: CarrierLabelDocument }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "no_carrier_order" }
  | { ok: false; reason: "not_allowed_for_status" }
  | { ok: false; reason: "unsupported_service" }
  | { ok: false; reason: "carrier_not_connected" }
  | { ok: false; reason: "not_ready" }
  | { ok: false; reason: "carrier_auth" };

/**
 * Fetch a shipping-label PDF for one shipment owned by companyId.
 *
 * Deps are required (no defaults to prisma / real adapters / network) so unit
 * tests need neither DB nor carrier. loadShipment MUST take both id and
 * companyId — scoping cannot be forgotten by a future caller.
 *
 * Status allow-list lives in order-adapter-label-support (shared with the
 * list cell) — do not redeclare it here.
 */
export async function getShipmentLabel(
  input: { shipmentId: string; companyId: string },
  deps: GetShipmentLabelDeps,
): Promise<GetShipmentLabelResult> {
  const row = await deps.loadShipment(input.shipmentId, input.companyId);
  if (!row) {
    return { ok: false, reason: "not_found" };
  }

  if (row.providerOrderId == null || row.providerOrderId.trim() === "") {
    return { ok: false, reason: "no_carrier_order" };
  }

  if (!isLabelAllowedStatus(row.status)) {
    return { ok: false, reason: "not_allowed_for_status" };
  }

  const adapter = deps.resolveAdapter(row.orderAdapterKey);
  if (typeof adapter.generateLabels !== "function") {
    return { ok: false, reason: "unsupported_service" };
  }

  const credsResult = await deps.getCredentials(
    input.companyId,
    adapter.providerKey,
  );
  if (!credsResult.ok) {
    return { ok: false, reason: "carrier_not_connected" };
  }

  try {
    const document = await adapter.generateLabels(
      [row.providerOrderId],
      credsResult.credentials,
    );
    return { ok: true, document };
  } catch (error) {
    if (error instanceof CarrierLabelsNotReadyError) {
      // Provider «try again later» text stays in logs only — never in the result.
      console.error(
        "[getShipmentLabel] labels not ready",
        JSON.stringify({ shipmentId: row.id }),
        error.message,
      );
      return { ok: false, reason: "not_ready" };
    }
    if (error instanceof CarrierAuthError) {
      return { ok: false, reason: "carrier_auth" };
    }
    throw error;
  }
}
