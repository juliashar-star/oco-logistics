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
  /** ID пункта выдачи из /lists/points — для доставки до ПВЗ */
  pointOutId?: number;
};

export type PickupPoint = {
  id: number;
  providerKey: string;
  code: string;
  name: string;
  address: string;
  city: string;
};

export type ListPointsInput = {
  city: string;
  limit?: number;
  offset?: number;
  providerKey?: string;
};

export type ListPointsResult = {
  points: PickupPoint[];
  total: number;
  offset: number;
  limit: number;
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
  /** Исходный объект тарифа из ответа APIShip (для сохранения в БД) */
  rawVariant?: unknown;
};

export type CalculateResult = {
  quotes: DeliveryQuote[];
  /** Полный ответ POST /calculator — сохраняем целиком, ничего не отбрасываем */
  rawResponse: unknown;
  /** APIShip не вернул тарифы с addressString — повторили расчёт только по городам */
  usedAddressFallback?: boolean;
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

export type CreateOrderAddress = {
  countryCode: string;
  contactName: string;
  phone: string;
  city: string;
  addressString?: string;
  companyName?: string;
  companyInn?: string;
  email?: string;
};

export type CreateOrderInput = {
  clientNumber: string;
  providerKey: string;
  tariffId: number;
  /** 1 = до двери, 2 = до ПВЗ */
  deliveryType: 1 | 2;
  /** 1 = забор от двери отправителя */
  pickupType?: 1 | 2;
  weightG: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  pointOutId?: number;
  assessedCostRub?: number;
  sender: CreateOrderAddress;
  recipient: CreateOrderAddress;
};

export type CreateOrderResult = {
  orderId: string;
  created?: string;
  rawResponse: unknown;
};

export type OrderInfoResult = {
  orderId: string;
  providerNumber: string | null;
  additionalProviderNumber: string | null;
  rawResponse: unknown;
};

export type OrderLabelsResult = {
  url: string | null;
  failedOrders: number[] | null;
  rawResponse: unknown;
};
