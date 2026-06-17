import { fetchApishipToken } from "./auth";
import type {
  ApishipConfig,
  CalculateInput,
  CalculateResult,
  DeliveryQuote,
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

type CalculatorResponse = {
  deliveryToDoor?: CalculatorTariff[];
  deliveryToPoint?: CalculatorTariff[];
  message?: string;
  description?: string;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
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
    const payload = {
      from: {
        countryCode: input.from.countryCode,
        city: input.from.city,
        region: input.from.region,
        addressString: input.from.addressString,
      },
      to: {
        countryCode: input.to.countryCode,
        city: input.to.city,
        region: input.to.region,
        addressString: input.to.addressString,
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
    };

    const data = await this.request<CalculatorResponse>("/calculator", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const quotes: DeliveryQuote[] = [];

    for (const tariff of data.deliveryToDoor ?? []) {
      const quote = mapTariff(tariff, "door");
      if (quote) quotes.push(quote);
    }

    for (const tariff of data.deliveryToPoint ?? []) {
      const quote = mapTariff(tariff, "point");
      if (quote) quotes.push(quote);
    }

    return { quotes };
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
