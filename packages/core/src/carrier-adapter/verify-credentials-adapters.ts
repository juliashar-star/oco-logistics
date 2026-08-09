import type { CarrierCredentials } from "./types";
import { CarrierAuthError } from "./errors";
import {
  CdekHttpStatusError,
  assertCdekCredentials,
  fetchCdekToken,
  resolveBaseUrl as resolveCdekBaseUrl,
} from "./cdek/transport";
import {
  assertYandexCredentials,
  resolveBaseUrl as resolveYandexBaseUrl,
  yandexPost,
} from "./yandex/transport";

/**
 * Credential-check capability only — NOT part of the CarrierAdapter interface.
 * Same shape and resolution rules as PICKUP_POINT_ADAPTERS (own module, keyed by
 * providerKey, prototype-safe key guard).
 *
 * One question per carrier: are these credentials accepted, rejected, or is the
 * carrier unavailable right now? Never throws for an expected carrier outcome —
 * an expected outcome is a verdict, not an exception.
 *
 * No secret and no provider response body ever enters a verdict: `reason` is a
 * fixed code from the union below, nothing else.
 */

export type VerifyCredentialsVerdict =
  | { status: "accepted" }
  | { status: "rejected"; reason: VerifyRejectedReason }
  | { status: "unavailable" };

/**
 * Machine-readable rejection reasons. `invalid_source_station` and
 * `invalid_auth` are deliberately distinct: measured on the Yandex tst sandbox,
 * a wrong source platform_station_id answers HTTP 400 code "validation_error"
 * and does NOT raise YandexAuthError, while a bad token answers 401/403.
 * `malformed_credentials` covers a bag missing the fields the adapter needs.
 */
export type VerifyRejectedReason =
  | "invalid_auth"
  | "invalid_source_station"
  | "malformed_credentials";

/**
 * The observed outcome of ONE verification attempt, normalised away from any
 * carrier's wire vocabulary so the mapping below can be a pure function.
 */
export type VerifyOutcome =
  | { kind: "ok" }
  | { kind: "auth_failed" }
  /**
   * HTTP 400 with whatever `code` the body carried (null when absent or the
   * body was unreadable). The CODE is reported here, not judged — judging it is
   * the mapper's job.
   */
  | { kind: "bad_request"; code: string | null }
  | { kind: "server_error" }
  | { kind: "malformed_credentials" }
  | { kind: "config_error" }
  | { kind: "transport_error" };

/**
 * PURE verdict mapping — the decision, testable without a network.
 *
 * Refuse only what has been MEASURED to mean bad credentials:
 *
 * ok                    → accepted (INCLUDING a 200 with an empty option list;
 *                         the verdict is never derived from whether options came back)
 * auth_failed (401/403) → rejected/invalid_auth
 * bad_request "validation_error"
 *                       → rejected/invalid_source_station (measured 05.08: a wrong
 *                         source platform_station_id answers exactly this)
 * bad_request any other code, or none readable
 *                       → ACCEPTED. This deliberately inverts «a guard built on a
 *                         fallback does not guard»: nobody can enumerate a carrier's
 *                         error codes in advance, and failing closed on an unknown
 *                         code locks a valid seller out of a working carrier, while
 *                         failing open at worst stores credentials the carrier will
 *                         reject later at order time.
 *                         Measured 09.08: valid stored credentials answered 400
 *                         "pickups_not_configured" while the same credentials were
 *                         producing working Express offers on the same screen.
 * malformed_credentials → rejected/malformed_credentials
 * server_error (5xx)    → unavailable (callers retry BEFORE mapping; see below)
 * config_error          → unavailable (OUR base URL is unset — nothing is wrong
 *                         with the seller's credentials, so never "rejected")
 * transport_error       → unavailable
 */
export function verdictForOutcome(
  outcome: VerifyOutcome,
): VerifyCredentialsVerdict {
  switch (outcome.kind) {
    case "ok":
      return { status: "accepted" };
    case "auth_failed":
      return { status: "rejected", reason: "invalid_auth" };
    case "bad_request":
      // The one 400 code measured to mean bad credentials is refused; every
      // other 400 is accepted, for the reason in this function's header.
      return outcome.code === "validation_error"
        ? { status: "rejected", reason: "invalid_source_station" }
        : { status: "accepted" };
    case "malformed_credentials":
      return { status: "rejected", reason: "malformed_credentials" };
    case "server_error":
    case "config_error":
    case "transport_error":
      return { status: "unavailable" };
  }
}

/** 5xx is retried this many times in total before the verdict becomes unavailable. */
export const VERIFY_SERVER_ERROR_ATTEMPTS = 3;

/**
 * Fixed internal probe for the Yandex pricing-calculator. One place, named:
 * the check must not depend on a caller-supplied destination or parcel, and a
 * changed constant must be visible as a change here.
 */
export const YANDEX_VERIFY_DESTINATION_ADDRESS = "Москва, Тверская улица, 7";
export const YANDEX_VERIFY_TARIFF = "time_interval";
export const YANDEX_VERIFY_ITEM = {
  weight_kg: 1,
  length_cm: 20,
  width_cm: 20,
  height_cm: 20,
} as const;

export type VerifyCredentialsFn = (
  credentials: CarrierCredentials,
) => Promise<VerifyCredentialsVerdict>;

export type VerifyCredentialsAdapter = {
  providerKey: string;
  verifyCredentials: VerifyCredentialsFn;
};

/**
 * Run `attempt` up to VERIFY_SERVER_ERROR_ATTEMPTS times while it reports a 5xx.
 * A 400 or 401/403 is returned immediately — those are answers, not blips.
 */
async function withServerErrorRetry(
  attempt: () => Promise<VerifyOutcome>,
): Promise<VerifyOutcome> {
  let last: VerifyOutcome = { kind: "server_error" };
  for (let i = 0; i < VERIFY_SERVER_ERROR_ATTEMPTS; i++) {
    last = await attempt();
    if (last.kind !== "server_error") {
      return last;
    }
  }
  return last;
}

/**
 * CDEK: fetching an OAuth token IS the check — it exercises account and
 * securePassword. contractType is deliberately NOT checked: no CDEK endpoint
 * reveals the account's contract type, so a verdict about it would be invented.
 *
 * Reuses the existing fetchCdekToken unchanged (token cache included; the cache
 * key covers the secret, so a rotated password cannot be answered from cache).
 */
async function verifyCdekCredentials(
  credentials: CarrierCredentials,
): Promise<VerifyCredentialsVerdict> {
  let creds;
  try {
    creds = assertCdekCredentials(credentials);
  } catch {
    return verdictForOutcome({ kind: "malformed_credentials" });
  }

  // Inside the guarded region: an unset CDEK_BASE_URL is OUR misconfiguration,
  // so it becomes a verdict (unavailable), never a throw and never "rejected".
  let baseUrl: string;
  try {
    baseUrl = resolveCdekBaseUrl("CDEK_BASE_URL");
  } catch {
    return verdictForOutcome({ kind: "config_error" });
  }

  const outcome = await withServerErrorRetry(async () => {
    try {
      await fetchCdekToken(baseUrl, creds);
      return { kind: "ok" } as VerifyOutcome;
    } catch (error) {
      // 401/403 arrive as CdekAuthError (a CarrierAuthError).
      if (error instanceof CarrierAuthError) {
        return { kind: "auth_failed" } as VerifyOutcome;
      }
      // Non-auth non-ok token replies carry the numeric status on the error —
      // classify on the number, never by matching the message text.
      if (error instanceof CdekHttpStatusError && error.status >= 500) {
        return { kind: "server_error" } as VerifyOutcome;
      }
      return { kind: "transport_error" } as VerifyOutcome;
    }
  });

  return verdictForOutcome(outcome);
}

/**
 * Extract ONLY the provider's `code` string from an error response, or null.
 * Everything else in the body is dropped here and never returned, so no
 * provider text can travel further. An unparseable body is simply null.
 */
async function readErrorCode(response: Response): Promise<string | null> {
  try {
    const raw: unknown = await response.json();
    if (raw !== null && typeof raw === "object" && "code" in raw) {
      const code = (raw as { code: unknown }).code;
      return typeof code === "string" ? code : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Yandex: a pricing-calculator call with the fixed internal probe above.
 * Measured on the tst sandbox — a wrong source platform_station_id answers
 * HTTP 400 "validation_error" (NOT 401/403), so it maps to its own reason.
 * HTTP 200 is accepted even when no options come back.
 */
async function verifyYandexCredentials(
  credentials: CarrierCredentials,
): Promise<VerifyCredentialsVerdict> {
  let creds;
  try {
    creds = assertYandexCredentials(credentials);
  } catch {
    return verdictForOutcome({ kind: "malformed_credentials" });
  }

  // Inside the guarded region, same reasoning as CDEK above.
  let baseUrl: string;
  try {
    baseUrl = resolveYandexBaseUrl("YANDEX_DELIVERY_BASE_URL");
  } catch {
    return verdictForOutcome({ kind: "config_error" });
  }

  const body = {
    source: { platform_station_id: creds.platformStationId },
    destination: { address: YANDEX_VERIFY_DESTINATION_ADDRESS },
    tariff: YANDEX_VERIFY_TARIFF,
    items: [{ ...YANDEX_VERIFY_ITEM }],
  };

  const outcome = await withServerErrorRetry(async () => {
    let response: Response;
    try {
      response = await yandexPost(
        baseUrl,
        creds,
        "/api/b2b/platform/pricing-calculator",
        body,
      );
    } catch (error) {
      // yandexPost throws YandexAuthError on 401/403.
      if (error instanceof CarrierAuthError) {
        return { kind: "auth_failed" } as VerifyOutcome;
      }
      return { kind: "transport_error" } as VerifyOutcome;
    }

    if (response.status >= 500) {
      return { kind: "server_error" } as VerifyOutcome;
    }
    if (response.status === 200) {
      // Accepted regardless of the body: an empty option list still proves the
      // credentials. The body is never read into the verdict.
      return { kind: "ok" } as VerifyOutcome;
    }
    if (response.status === 400) {
      // Read ONE code string and discard everything else — the body never
      // reaches a verdict, a log or an error. The code is REPORTED, not judged:
      // verdictForOutcome decides what it means, so the rule lives in one pure
      // place instead of in this branch.
      return {
        kind: "bad_request",
        code: await readErrorCode(response),
      } as VerifyOutcome;
    }
    return { kind: "transport_error" } as VerifyOutcome;
  });

  return verdictForOutcome(outcome);
}

export const VERIFY_CREDENTIALS_ADAPTERS: Record<
  string,
  VerifyCredentialsAdapter
> = {
  yataxi: {
    providerKey: "yataxi",
    verifyCredentials: verifyYandexCredentials,
  },
  cdek: {
    providerKey: "cdek",
    verifyCredentials: verifyCdekCredentials,
  },
};

/**
 * True only for a non-empty string that is an OWN key of
 * VERIFY_CREDENTIALS_ADAPTERS. Do NOT use `in`: it walks the prototype chain, so
 * user-controlled strings like "toString" / "__proto__" would pass.
 * (Same guard as isKnownPickupPointProviderKey.)
 */
export function isKnownVerifyCredentialsProviderKey(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Object.prototype.hasOwnProperty.call(VERIFY_CREDENTIALS_ADAPTERS, value)
  );
}

export function getVerifyCredentialsAdapter(
  providerKey: string,
): VerifyCredentialsAdapter | undefined {
  return VERIFY_CREDENTIALS_ADAPTERS[providerKey];
}
