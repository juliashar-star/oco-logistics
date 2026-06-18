import { fetchApishipToken } from "./auth";
import { buildCreateOrderPayload } from "./build-create-order";
import type {
  ApishipConfig,
  CalculateInput,
  CalculateResult,
  CreateOrderInput,
  CreateOrderResult,
  DeliveryQuote,
  ListPointsInput,
  ListPointsResult,
  OrderInfoResult,
  OrderLabelsResult,
  PickupPoint,
} from "./types";
import { ApishipError } from "./types";

type CalculatorTariff = {
  providerKey?: string;
  tariffId?: number;
  tariffName?: string;
  deliveryCost?: number;
  workDaysMin?: number;
  workDaysMax?: number;
  calendarDaysMin?: number;
  calendarDaysMax?: number;
  daysMin?: number;
  daysMax?: number;
};

type CalculatorProviderGroup = {
  providerKey?: string;
  tariffs?: CalculatorTariff[];
};

type CalculatorResponse = {
  deliveryToDoor?: CalculatorProviderGroup[];
  deliveryToPoint?: CalculatorProviderGroup[];
  message?: string;
  description?: string;
};

type PointsRow = {
  id?: number | string;
  providerKey?: string;
  code?: string;
  name?: string;
  address?: string;
  city?: string;
};

type PointsResponse = {
  rows?: PointsRow[];
  meta?: {
    total?: number;
    offset?: number;
    limit?: number;
  };
};

function buildPointsFilter(input: ListPointsInput): string {
  const parts = [
    `city=${input.city}`,
    "availableOperation=[2,3]",
    "type=[1,2,3,4]",
  ];
  if (input.providerKey) {
    parts.push(`providerKey=${input.providerKey}`);
  }
  return parts.join(";");
}

function mapPickupPoint(row: PointsRow): PickupPoint | null {
  const id = typeof row.id === "string" ? Number(row.id) : row.id;
  if (!id || !row.providerKey || !row.address) {
    return null;
  }

  return {
    id,
    providerKey: row.providerKey,
    code: row.code ?? String(id),
    name: row.name ?? row.address,
    address: row.address,
    city: row.city ?? "",
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function collectQuotes(
  groups: CalculatorProviderGroup[] | undefined,
  deliveryMode: "door" | "point",
): DeliveryQuote[] {
  const quotes: DeliveryQuote[] = [];

  for (const group of groups ?? []) {
    for (const tariff of group.tariffs ?? []) {
      const merged = { ...tariff, providerKey: tariff.providerKey ?? group.providerKey };
      const quote = mapTariff(merged, deliveryMode);
      if (quote) {
        quotes.push({
          ...quote,
          rawVariant: merged,
        });
      }
    }
  }

  return quotes;
}

function parseCalculatorResponse(data: CalculatorResponse): DeliveryQuote[] {
  return [
    ...collectQuotes(data.deliveryToDoor, "door"),
    ...collectQuotes(data.deliveryToPoint, "point"),
  ];
}

function hasAddressStrings(input: CalculateInput): boolean {
  return Boolean(input.from.addressString?.trim() || input.to.addressString?.trim());
}

function withoutAddressStrings(input: CalculateInput): CalculateInput {
  return {
    ...input,
    from: { ...input.from, addressString: undefined },
    to: { ...input.to, addressString: undefined },
  };
}

function mapTariff(
  tariff: CalculatorTariff,
  deliveryMode: "door" | "point",
): DeliveryQuote | null {
  if (!tariff.providerKey || tariff.deliveryCost == null || tariff.tariffId == null) {
    return null;
  }

  const daysMin =
    tariff.workDaysMin ?? tariff.calendarDaysMin ?? tariff.daysMin ?? 0;
  const daysMax =
    tariff.workDaysMax ?? tariff.calendarDaysMax ?? tariff.daysMax ?? daysMin;

  return {
    providerKey: tariff.providerKey,
    tariffId: tariff.tariffId,
    tariffName: tariff.tariffName ?? `Тариф ${tariff.tariffId}`,
    deliveryCostRub: tariff.deliveryCost,
    deliveryDaysMin: daysMin,
    deliveryDaysMax: daysMax,
    deliveryMode,
  };
}

export class ApishipClient {
  constructor(private readonly config: ApishipConfig) {}

  private get baseUrl(): string {
    return normalizeBaseUrl(this.config.baseUrl);
  }

  async testConnection(): Promise<void> {
    await fetchApishipToken(this.config);
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await fetchApishipToken(this.config);

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: token,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });

    const body = (await response.json().catch(() => ({}))) as T & {
      message?: string;
      description?: string;
      code?: string;
    };

    if (!response.ok) {
      throw new ApishipError(
        body.description ?? body.message ?? "Ошибка запроса к APIShip",
        response.status,
        body.code,
      );
    }

    return body as T;
  }

  async calculate(input: CalculateInput): Promise<CalculateResult> {
    const primary = await this.calculateOnce(input);

    if (primary.quotes.length > 0 || !hasAddressStrings(input)) {
      return primary;
    }

    const fallbackInput = withoutAddressStrings(input);
    const fallback = await this.calculateOnce(fallbackInput);

    return {
      quotes: fallback.quotes,
      usedAddressFallback: true,
      rawResponse: {
        usedAddressFallback: true,
        attempts: [
          { withAddress: true, response: primary.rawResponse },
          { withAddress: false, response: fallback.rawResponse },
        ],
      },
    };
  }

  private async calculateOnce(input: CalculateInput): Promise<CalculateResult> {
    const payload = {
      from: {
        countryCode: input.from.countryCode,
        city: input.from.city,
        region: input.from.region,
        ...(input.from.addressString ? { addressString: input.from.addressString } : {}),
      },
      to: {
        countryCode: input.to.countryCode,
        city: input.to.city,
        region: input.to.region,
        ...(input.to.addressString ? { addressString: input.to.addressString } : {}),
      },
      weight: input.weightG,
      width: input.widthCm,
      height: input.heightCm,
      length: input.lengthCm,
      assessedCost: input.assessedCostRub,
      deliveryTypes: input.deliveryTypes ?? [1, 2],
      pickupTypes: [1, 2],
      includeFees: true,
      timeout: 20000,
      ...(input.pointOutId != null ? { pointOutId: input.pointOutId } : {}),
    };

    const data = await this.request<CalculatorResponse>("/calculator", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const quotes = parseCalculatorResponse(data);

    return { quotes, rawResponse: data };
  }

  async listPoints(input: ListPointsInput): Promise<ListPointsResult> {
    const limit = input.limit ?? 100;
    const offset = input.offset ?? 0;
    const query = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      filter: buildPointsFilter(input),
      stateCheckOff: "1",
    });

    const data = await this.request<PointsResponse>(`/lists/points?${query.toString()}`);

    const points = (data.rows ?? [])
      .map(mapPickupPoint)
      .filter((point): point is PickupPoint => point != null);

    return {
      points,
      total: data.meta?.total ?? points.length,
      offset: data.meta?.offset ?? offset,
      limit: data.meta?.limit ?? limit,
    };
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const payload = buildCreateOrderPayload(input);
    const data = await this.request<{
      orderId?: number | string;
      created?: string;
    }>("/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (data.orderId == null) {
      throw new ApishipError("APIShip не вернул идентификатор заказа");
    }

    return {
      orderId: String(data.orderId),
      created: data.created,
      rawResponse: data,
    };
  }

  async getOrderInfo(orderId: string): Promise<OrderInfoResult> {
    const data = await this.request<{
      order?: {
        orderId?: number | string;
        providerNumber?: string;
        additionalProviderNumber?: string;
      };
    }>(`/orders/${encodeURIComponent(orderId)}`);

    const order = data.order ?? (data as { orderId?: number | string });
    const providerNumber =
      (data.order?.providerNumber ?? (order as { providerNumber?: string }).providerNumber) ||
      null;
    const additionalProviderNumber =
      data.order?.additionalProviderNumber ??
      (order as { additionalProviderNumber?: string }).additionalProviderNumber ??
      null;

    return {
      orderId: String(data.order?.orderId ?? orderId),
      providerNumber: providerNumber?.trim() || null,
      additionalProviderNumber: additionalProviderNumber?.trim() || null,
      rawResponse: data,
    };
  }

  async getOrderStatusByClientNumber(clientNumber: string): Promise<OrderInfoResult | null> {
    const query = new URLSearchParams({ clientNumber });
    const data = await this.request<{
      rows?: Array<{
        orderId?: number | string;
        providerNumber?: string;
        additionalProviderNumber?: string;
      }>;
    }>(`/orders/status?${query.toString()}`);

    const row = data.rows?.[0];
    if (!row) {
      return null;
    }

    return {
      orderId: row.orderId != null ? String(row.orderId) : clientNumber,
      providerNumber: row.providerNumber?.trim() || null,
      additionalProviderNumber: row.additionalProviderNumber?.trim() || null,
      rawResponse: data,
    };
  }

  async getLabels(orderIds: number[]): Promise<OrderLabelsResult> {
    const data = await this.request<{
      url?: string;
      failedOrders?: number[] | null;
    }>("/orders/labels", {
      method: "POST",
      body: JSON.stringify({
        orderIds,
        format: "pdf",
      }),
    });

    return {
      url: data.url?.trim() || null,
      failedOrders: data.failedOrders ?? null,
      rawResponse: data,
    };
  }

  /** Пытается получить трек-номер сразу после создания (короткий опрос). */
  async resolveTrackNumber(
    orderId: string,
    clientNumber: string,
    attempts = 3,
    delayMs = 1000,
  ): Promise<string | null> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const info = await this.getOrderInfo(orderId);
      const track = info.providerNumber ?? info.additionalProviderNumber;
      if (track) {
        return track;
      }

      const status = await this.getOrderStatusByClientNumber(clientNumber);
      const statusTrack = status?.providerNumber ?? status?.additionalProviderNumber;
      if (statusTrack) {
        return statusTrack;
      }

      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return null;
  }
}

export function createApishipClient(config: ApishipConfig): ApishipClient {
  return new ApishipClient(config);
}

export function createApishipClientFromEnv(): ApishipClient {
  const baseUrl = process.env.APISHIP_BASE_URL;
  const login = process.env.APISHIP_LOGIN;
  const password = process.env.APISHIP_PASSWORD;

  if (!baseUrl || !login || !password) {
    throw new ApishipError(
      "APIShip не настроен: задайте APISHIP_BASE_URL, APISHIP_LOGIN и APISHIP_PASSWORD в .env",
    );
  }

  return createApishipClient({ baseUrl, login, password });
}
