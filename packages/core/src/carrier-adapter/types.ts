/**
 * OCO's own unified carrier contract. These types are NOT derived from
 * or constrained by any single provider's API (including APIShip) —
 * they define OCO's neutral model that every CarrierAdapter
 * implementation must translate to/from its own provider's API shape.
 */
import type {
  ApishipAddress,
  CreateOrderAddress,
  DeliveryInterval,
  ShipmentStatus,
} from "@oco/apiship";

/**
 * Opaque per-provider credential bag. Shape is provider-specific and validated
 * by each adapter implementation — not enforced by this shared type.
 * Examples: Yandex — { platformStationId, token }; APIShip — { login, password }.
 */
export type CarrierCredentials = Record<string, string>;

export type CarrierCalculateInput = {
  from: ApishipAddress; // reuse — already neutral (country/city/region)
  to: ApishipAddress;
  weightG: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  assessedCostRub?: number;
  pointOutId?: string; // was number in APIShip's CalculateInput — Yandex uses UUIDs
  // deliberately omit `deliveryTypes?: number[]` — APIShip-specific numeric
  // tariff codes, no equivalent concept in a neutral contract
};

export type CarrierListPointsInput = {
  city: string;
  limit?: number;
  offset?: number;
  // deliberately omit `providerKey?` — redundant when the adapter is
  // already scoped to one provider; only APIShip's cross-carrier
  // aggregation needed it as a filter
};

export type CarrierPickupPoint = {
  id: string; // was number in APIShip's PickupPoint — Yandex uses UUIDs
  providerKey: string; // kept: needed when the orchestrator aggregates
                        // points from multiple adapters for shared UI
  code: string;
  name: string;
  address: string;
  city: string;
  /** Geographic position — every carrier's pickup points have one. */
  latitude: number;
  longitude: number;
  /** Full raw provider response for this point (data asset; schedule,
   *  services, instructions etc. we don't model yet). */
  rawPoint?: unknown;
};

export type CarrierDeliveryQuote = {
  providerKey: string; // kept: same aggregation reason as above
  tariffId: string; // was number in APIShip's DeliveryQuote
  /**
   * Reserved for future (carrier × variant) ranking engine work — not yet
   * wired into rank.ts. Lets an adapter tag which registry variant
   * (e.g. yataxi's express_fast, pvz, cargo) a quote corresponds to,
   * without forcing that engine change now.
   */
  variantKey?: string;
  tariffName: string;
  deliveryCostRub: number;
  deliveryDaysMin: number;
  deliveryDaysMax: number;
  deliveryMode: "door" | "point";
  rawVariant?: unknown;
};

export type CarrierOrderItem = {
  name: string;
  quantity: number;
  unitPriceRub: number;
  weightG: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  /** Честный знак */
  markingCode?: { gtin: string; serialNumber: string };
  inn?: string;
  vatRate?: number;
};

export type CarrierCodInfo = {
  enabled: boolean;
  amountRub?: number;
};

export type CarrierCreateOrderInput = {
  clientNumber: string;
  providerKey: string;
  /** Some adapters resolve tariff internally and do not require this. */
  tariffId?: string;
  sender: CreateOrderAddress;
  recipient: CreateOrderAddress;
  items: CarrierOrderItem[];
  cod?: CarrierCodInfo;
  assessedCostRub?: number;
  /** PVZ identifier — string to support UUIDs (e.g. Yandex) as well as numeric ids. */
  pointOutId?: string;
  deliveryDate?: string;
  deliveryTimeStart?: string;
  deliveryTimeEnd?: string;
};

export type CarrierCreateOrderResult = {
  /** Provider-side order identifier. */
  orderId: string;
  /**
   * false when the provider recognized an idempotency key and
   * returned an already-existing order rather than creating a new
   * one (Yandex: HTTP 208). true on a fresh creation.
   */
  isNewOrder: boolean;
  /** Full raw provider response (data asset). */
  rawResponse: unknown;
};

export type CarrierCancelResult = {
  canceled: boolean;
  reason?: string;
};

export interface CarrierAdapter {
  providerKey: string;
  calculateQuotes(
    input: CarrierCalculateInput,
    credentials: CarrierCredentials,
  ): Promise<CarrierDeliveryQuote[]>;
  listPickupPoints(
    input: CarrierListPointsInput,
    credentials: CarrierCredentials,
  ): Promise<CarrierPickupPoint[]>;
  createOrder(
    input: CarrierCreateOrderInput,
    credentials: CarrierCredentials,
  ): Promise<CarrierCreateOrderResult>;
  getOrderStatus(
    providerOrderId: string,
    credentials: CarrierCredentials,
  ): Promise<ShipmentStatus>;
  cancelOrder(
    providerOrderId: string,
    credentials: CarrierCredentials,
  ): Promise<CarrierCancelResult>;
}

export type {
  CreateOrderAddress,
  DeliveryInterval,
  ShipmentStatus,
};
