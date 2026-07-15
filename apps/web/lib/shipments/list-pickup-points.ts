import type { CarrierPickupPoint } from "@oco/core/carrier-adapter/types";
import type { PickupPointAdapter } from "@oco/core/carrier-adapter/pickup-point-adapters";

import type { ConnectedCarrier } from "./list-connected-carriers";

export type CarrierPointsStatus =
  | "ok"
  | "city_not_resolved"
  | "no_adapter"
  | "failed";

export type CarrierPointsEntry = {
  providerKey: string;
  status: CarrierPointsStatus;
  resolvedLocation?: { id: string; address: string };
};

export type ListPickupPointsForCompanyResult = {
  points: CarrierPickupPoint[];
  carriers: CarrierPointsEntry[];
};

export type ListPickupPointsForCompanyDeps = {
  listConnected: () => Promise<ConnectedCarrier[]>;
  getAdapter: (providerKey: string) => PickupPointAdapter | undefined;
};

/**
 * Aggregate pickup points across a company's connected carriers.
 *
 * Deps are required (no defaults to real listConnected / getAdapter) so this
 * layer imports neither prisma nor adapters — tests need neither DB nor network.
 *
 * Per-carrier: no_adapter / city_not_resolved / throw → status on that carrier
 * only; other carriers' points still returned. Provider error text stays
 * server-side (console.error); the return value carries status only.
 * Points are concatenated in connected-carrier order — not re-sorted.
 */
export async function listPickupPointsForCompany(
  input: { city: string },
  deps: ListPickupPointsForCompanyDeps,
): Promise<ListPickupPointsForCompanyResult> {
  const connected = await deps.listConnected();
  const points: CarrierPickupPoint[] = [];
  const carriers: CarrierPointsEntry[] = [];

  for (const carrier of connected) {
    const adapter = deps.getAdapter(carrier.providerKey);
    if (!adapter) {
      carriers.push({
        providerKey: carrier.providerKey,
        status: "no_adapter",
      });
      continue;
    }

    try {
      const result = await adapter.listPickupPoints(
        { city: input.city },
        carrier.credentials,
      );
      if (!result.ok) {
        carriers.push({
          providerKey: carrier.providerKey,
          status: "city_not_resolved",
        });
        continue;
      }
      carriers.push({
        providerKey: carrier.providerKey,
        status: "ok",
        resolvedLocation: result.resolvedLocation,
      });
      points.push(...result.points);
    } catch (error) {
      console.error(
        "[listPickupPointsForCompany] adapter failed",
        carrier.providerKey,
        error,
      );
      carriers.push({
        providerKey: carrier.providerKey,
        status: "failed",
      });
    }
  }

  return { points, carriers };
}
