import type { ApishipConfig, ApishipCredentials } from "./types";
import { ApishipError } from "./types";

type LoginResponse = {
  token?: string;
  accessToken?: string;
};

/** Кэш токенов: один раз получили — переиспользуем (APIShip не проверяет срок). */
const tokenCache = new Map<string, string>();

function cacheKey(baseUrl: string, login: string): string {
  return `${baseUrl.replace(/\/$/, "")}:${login}`;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

export async function fetchApishipToken(
  config: ApishipConfig,
  options?: { forceRefresh?: boolean },
): Promise<string> {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const key = cacheKey(baseUrl, config.login);

  if (!options?.forceRefresh) {
    const cached = tokenCache.get(key);
    if (cached) return cached;
  }

  const response = await fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      login: config.login,
      password: config.password,
    }),
  });

  const body = (await response.json().catch(() => ({}))) as LoginResponse & {
    message?: string;
    description?: string;
  };

  if (!response.ok) {
    throw new ApishipError(
      body.description ?? body.message ?? "Не удалось авторизоваться в APIShip",
      response.status,
    );
  }

  const token = body.token ?? body.accessToken;
  if (!token) {
    throw new ApishipError("APIShip не вернул токен авторизации");
  }

  tokenCache.set(key, token);
  return token;
}

export function clearApishipTokenCache(
  credentials?: ApishipCredentials & { baseUrl?: string },
): void {
  if (!credentials?.login) {
    tokenCache.clear();
    return;
  }
  if (credentials.baseUrl) {
    tokenCache.delete(cacheKey(normalizeBaseUrl(credentials.baseUrl), credentials.login));
    return;
  }
  for (const key of tokenCache.keys()) {
    if (key.endsWith(`:${credentials.login}`)) {
      tokenCache.delete(key);
    }
  }
}

/** Для тестов: текущий размер кэша. */
export function getApishipTokenCacheSize(): number {
  return tokenCache.size;
}
