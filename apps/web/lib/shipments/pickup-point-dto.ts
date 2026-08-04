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
  isDarkStore: boolean;
  /**
   * Masked seller-facing carrier name (e.g. «Перевозчик №1»).
   * Always on the wire — same key set for every carrier. Resolved from
   * providerKey via the same display-name function as the offer card.
   */
  carrierName: string;
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
 * Same shape as ResolveOfferCarrierName, but keyed by providerKey — pickup
 * points already carry providerKey (offers carry adapterKey and map through
 * the order adapter). Required so this module does not import the map.
 */
export type ResolvePickupPointCarrierName = (providerKey: string) => string;

/**
 * Boundary map: internal CarrierPickupPoint → browser-safe DTO.
 * Fields named explicitly — never `{ ...point }` — so rawPoint/code cannot leak.
 */
export function toPickupPointsResponse(
  city: string,
  result: ListPickupPointsForCompanyResult,
  resolveCarrierName: ResolvePickupPointCarrierName,
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
      isDarkStore: point.isDarkStore,
      carrierName: resolveCarrierName(point.providerKey),
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
