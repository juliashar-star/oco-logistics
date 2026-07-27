import type { CarrierCredentials } from "@oco/core/carrier-adapter/types";
import { CarrierAuthError } from "../errors";

export class YandexAuthError extends CarrierAuthError {
  constructor(message: string) {
    super(message);
    this.name = "YandexAuthError";
  }
}

type YandexCredentials = { platformStationId: string; token: string };

export function assertYandexCredentials(creds: CarrierCredentials): YandexCredentials {
  const platformStationId = creds.platformStationId;
  const token = creds.token;
  if (!platformStationId || !token) {
    throw new Error("YANDEX_CREDENTIALS_INVALID: platformStationId and token are required");
  }
  return { platformStationId, token };
}

export function resolveBaseUrl(envName: string): string {
  const baseUrl = process.env[envName]?.trim();
  if (!baseUrl) {
    throw new Error(`${envName} is not configured`);
  }
  return baseUrl.replace(/\/$/, "");
}

export async function yandexPost(
  baseUrl: string,
  creds: YandexCredentials,
  path: string,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      ...extraHeaders,
      Authorization: `Bearer ${creds.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401 || response.status === 403) {
    throw new YandexAuthError(`Yandex Delivery auth failed: HTTP ${response.status}`);
  }

  return response;
}

/** GET counterpart to yandexPost — same auth throw on 401/403. Not reshaped from POST. */
export async function yandexGet(
  baseUrl: string,
  creds: YandexCredentials,
  pathWithQuery: string,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const response = await fetch(`${baseUrl}${pathWithQuery}`, {
    method: "GET",
    headers: {
      ...extraHeaders,
      Authorization: `Bearer ${creds.token}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new YandexAuthError(`Yandex Delivery auth failed: HTTP ${response.status}`);
  }

  return response;
}
