export type ApishipCredentials = {
  login: string;
  password: string;
};

export type ApishipConfig = ApishipCredentials & {
  baseUrl: string;
};

export type ApishipAddress = {
  countryCode: string;
  city: string;
  region?: string;
  addressString?: string;
};

export type CalculateInput = {
  from: ApishipAddress;
  to: ApishipAddress;
  weightG: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  /** 1 = курьер, 2 = ПВЗ — см. /lists/deliveryTypes */
  deliveryTypes?: number[];
  assessedCostRub?: number;
};

export type DeliveryQuote = {
  providerKey: string;
  tariffId: number;
  tariffName: string;
  deliveryCostRub: number;
  deliveryDaysMin: number;
  deliveryDaysMax: number;
  /** door = до двери, point = до ПВЗ */
  deliveryMode: "door" | "point";
};

export type CalculateResult = {
  quotes: DeliveryQuote[];
};

export class ApishipError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApishipError";
  }
}
