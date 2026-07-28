import type {
  CarrierPointsStatus,
  ListPickupPointsForCompanyResult,
} from "./list-pickup-points";
import type { CarrierPickupPointKind } from "@oco/core/carrier-adapter/types";

export type PickupPointDto = {
  id: string;
  providerKey: string;
  name: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  kind: CarrierPickupPointKind;
};

export type CarrierDto = {
  providerKey: string;
  status: CarrierPointsStatus;
  resolvedLocation?: { id: string; address: string };
};

export type PickupPointsResponse = {
  ok: true;
  city: string;
  points: PickupPointDto[];
  carriers: CarrierDto[];
};

/**
 * Boundary map: internal CarrierPickupPoint → browser-safe DTO.
 * Fields named explicitly — never `{ ...point }` — so rawPoint/code cannot leak.
 */
export function toPickupPointsResponse(
  city: string,
  result: ListPickupPointsForCompanyResult,
): PickupPointsResponse {
  return {
    ok: true,
    city,
    points: result.points.map((point) => ({
      id: point.id,
      providerKey: point.providerKey,
      name: point.name,
      address: point.address,
      city: point.city,
      latitude: point.latitude,
      longitude: point.longitude,
      kind: point.kind,
    })),
    carriers: result.carriers.map((carrier) => {
      if (carrier.resolvedLocation) {
        return {
          providerKey: carrier.providerKey,
          status: carrier.status,
          resolvedLocation: {
            id: carrier.resolvedLocation.id,
            address: carrier.resolvedLocation.address,
          },
        };
      }
      return {
        providerKey: carrier.providerKey,
        status: carrier.status,
      };
    }),
  };
}
