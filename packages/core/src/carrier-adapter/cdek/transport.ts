import type { CarrierCredentials } from "@oco/core/carrier-adapter/types";
import { CarrierAuthError } from "../errors";

export class CdekAuthError extends CarrierAuthError {
  constructor(message: string) {
    super(message);
    this.name = "CdekAuthError";
  }
}

type CdekCredentials = {
  account: string;
  securePassword: string;
  /**
   * CDEK calculator `type`: "1" = интернет-магазин, "2" = доставка.
   * Required with no default — C0 measured type 1 returning Посылка at
   * 150 RUB склад-склад while type 2 does not and the cheapest becomes
   * 325 RUB; guessing would double the price shown to a seller.
   */
  contractType: "1" | "2";
};

type CacheEntry = { token: string; expiresAtMs: number };

/**
 * Per-(baseUrl, account) OAuth token cache. Key includes account so two
 * tenants never share a token even when they share a base URL.
 */
const tokenCache = new Map<string, CacheEntry>();

/**
 * In-flight token fetches for the same key share one Promise so Promise.all
 * fan-out does not stampede /v2/oauth/token. Cleared on settle (success or
 * failure) so a rejected promise never poisons the next call.
 */
const inflight = new Map<string, Promise<string>>();

function cacheKey(baseUrl: string, account: string): string {
  return `${baseUrl}\u0000${account}`;
}

/**
 * Copied from yandex/transport (same three lines) rather than imported —
 * a CDEK module must not depend on the Yandex family. Same contract:
 * env name in, trimmed non-empty URL out, trailing slash stripped.
 */
export function resolveBaseUrl(envName: string): string {
  const baseUrl = process.env[envName]?.trim();
  if (!baseUrl) {
    throw new Error(`${envName} is not configured`);
  }
  return baseUrl.replace(/\/$/, "");
}

export function assertCdekCredentials(
  creds: CarrierCredentials,
): CdekCredentials {
  const account = creds.account;
  const securePassword = creds.securePassword;
  const contractType = creds.contractType;
  if (
    !account ||
    !securePassword ||
    (contractType !== "1" && contractType !== "2")
  ) {
    throw new Error(
      "CDEK_CREDENTIALS_INVALID: account, securePassword and contractType are required",
    );
  }
  return { account, securePassword, contractType };
}

/**
 * Parse expires_in into seconds.
 *
 * The wire type of expires_in was never measured on a live CDEK reply, so
 * this fallback is deliberate: accept a number or numeric string; if absent,
 * non-finite, or <= 0 → 3600 seconds. Never throw for expires_in.
 */
function parseExpiresInSeconds(raw: unknown): number {
  let seconds: number | undefined;
  if (typeof raw === "number") {
    seconds = raw;
  } else if (typeof raw === "string" && raw.trim() !== "") {
    seconds = Number(raw);
  }
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return 3600;
  }
  return seconds;
}

/**
 * Fetch a CDEK OAuth access_token (client_credentials), with a 60 s safety
 * margin before expires_in. `now` is injectable for expiry tests.
 */
export async function fetchCdekToken(
  baseUrl: string,
  creds: CdekCredentials,
  now: () => number = Date.now,
): Promise<string> {
  const key = cacheKey(baseUrl, creds.account);
  const cached = tokenCache.get(key);
  if (cached && now() < cached.expiresAtMs - 60_000) {
    return cached.token;
  }

  const pending = inflight.get(key);
  if (pending) {
    return pending;
  }

  const promise = (async () => {
    const response = await fetch(`${baseUrl}/v2/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: creds.account,
        client_secret: creds.securePassword,
      }).toString(),
    });

    if (response.status === 401 || response.status === 403) {
      // Do not read the body — it must never enter the Error message.
      throw new CdekAuthError(`CDEK auth failed: HTTP ${response.status}`);
    }
    if (!response.ok) {
      throw new Error(`CDEK token request failed: HTTP ${response.status}`);
    }

    const json = (await response.json()) as {
      access_token?: unknown;
      expires_in?: unknown;
    };
    if (typeof json.access_token !== "string" || json.access_token.length === 0) {
      throw new Error("CDEK token response missing access_token");
    }

    const expiresInSec = parseExpiresInSeconds(json.expires_in);
    tokenCache.set(key, {
      token: json.access_token,
      expiresAtMs: now() + expiresInSec * 1000,
    });
    return json.access_token;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

export async function cdekPost(
  baseUrl: string,
  creds: CdekCredentials,
  path: string,
  body: unknown,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const token = await fetchCdekToken(baseUrl, creds);
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      ...extraHeaders,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401 || response.status === 403) {
    throw new CdekAuthError(`CDEK auth failed: HTTP ${response.status}`);
  }

  return response;
}

export async function cdekGet(
  baseUrl: string,
  creds: CdekCredentials,
  pathWithQuery: string,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const token = await fetchCdekToken(baseUrl, creds);
  const response = await fetch(`${baseUrl}${pathWithQuery}`, {
    method: "GET",
    headers: {
      ...extraHeaders,
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new CdekAuthError(`CDEK auth failed: HTTP ${response.status}`);
  }

  return response;
}
