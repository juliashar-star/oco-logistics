import type { VerifyRejectedReason } from "@oco/core/carrier-adapter/verify-credentials-adapters";

import type { ConnectCarrierCredentialsResult } from "./connect-carrier-credentials";

/**
 * Service result → HTTP. PURE, so the wording and the status codes are testable
 * without auth, Prisma or Next.
 *
 * Every decision about a SERVICE RESULT lives here — the route maps none of them
 * itself. The route's catch block is the one other place a response is chosen,
 * and only for a THROWN error, which by definition is not a service result.
 *
 * Body shape matches the rest of the API: `{ ok: true }` on success,
 * `{ error: string }` on failure (same as /api/settings/company).
 *
 * `serverLog` is the operator-facing counterpart: some failures say nothing
 * useful to a seller but must not be invisible in the log. It is emitted by the
 * route when present. It carries no credential value and no seller data.
 */

export type ConnectResponse = {
  httpStatus: number;
  body: { ok: true } | { error: string };
  /** Emitted to the server log by the caller when present. */
  serverLog?: string;
};

/**
 * Seller-facing names for credential fields. OUR wording, not a carrier's — a
 * raw key like `platformStationId` must never reach a seller. Align these with
 * the connect form's input labels when that form exists.
 *
 * A drift test asserts every field in CARRIER_CREDENTIAL_FIELDS has an entry, so
 * a newly required field cannot silently fall back to the generic sentence.
 */
export const CREDENTIAL_FIELD_LABELS: Readonly<Record<string, string>> = {
  platformStationId: "идентификатор точки отгрузки",
  token: "токен доступа",
  // The OAuth client identifier we send with securePassword — an API login, not
  // an account number. Reads correctly inside «Проверьте поле «…»».
  account: "логин для доступа к API",
  securePassword: "пароль для доступа к API",
  contractType: "тип договора",
};

function invalidShapeMessage(field: string): string {
  const label = Object.prototype.hasOwnProperty.call(
    CREDENTIAL_FIELD_LABELS,
    field,
  )
    ? CREDENTIAL_FIELD_LABELS[field]
    : null;

  // Unknown field → generic sentence. Never echo the raw key.
  if (label === null) {
    return "Проверьте заполнение полей подключения.";
  }
  return `Проверьте поле «${label}»: оно не заполнено или заполнено неверно.`;
}

export function connectResultToResponse(
  result: ConnectCarrierCredentialsResult,
): ConnectResponse {
  switch (result.status) {
    case "stored":
      // 200, not 201: the service upserts, so a reconnect creates nothing new.
      return { httpStatus: 200, body: { ok: true } };

    case "invalid_shape":
      return {
        httpStatus: 400,
        body: { error: invalidShapeMessage(result.field) },
      };

    case "unknown_provider":
      // The requested key is not echoed back — it comes from the request body.
      return {
        httpStatus: 400,
        body: { error: "Этот перевозчик пока не поддерживается." },
      };

    case "rejected_by_carrier":
      return {
        httpStatus: 400,
        body: { error: rejectionMessage(result.reason) },
      };

    case "carrier_unavailable":
      // 503: temporary. Retrying later is the right advice.
      return {
        httpStatus: 503,
        body: {
          error: "Перевозчик сейчас не отвечает. Попробуйте позже.",
        },
      };

    case "storage_not_configured":
      // 500, not 503: OUR misconfiguration. The wording must not read as a
      // temporary carrier problem, because retrying fails identically until an
      // operator fixes the environment.
      return {
        httpStatus: 500,
        body: {
          error:
            "Сервис не готов сохранить данные подключения. Обратитесь в поддержку: повторная попытка не поможет.",
        },
        // Names the VARIABLE, never its value. Without this the seller sees a
        // 500 and the operator sees nothing at all.
        serverLog:
          "[carriers/connect] CARRIER_CREDENTIALS_ENCRYPTION_KEY is missing or shorter than 32 characters; carrier credentials cannot be stored until it is set",
      };
  }
}

/**
 * Wording differs per reason — that difference is the point of this function.
 *
 * `invalid_source_station` names the station as a PROBABLE cause only. We
 * measured that a wrong source platform_station_id answers HTTP 400
 * "validation_error", but so would a request the carrier stopped accepting for
 * another reason — the two are indistinguishable from the code alone. Asserting
 * the station is wrong would send a seller to re-check a correct value.
 */
function rejectionMessage(reason: VerifyRejectedReason): string {
  switch (reason) {
    case "invalid_auth":
      return "Перевозчик не принял эти данные. Проверьте их в личном кабинете перевозчика.";
    case "invalid_source_station":
      // Ends with something the seller can DO when the identifier is right —
      // our internal uncertainty about the cause is not actionable for them.
      return "Перевозчик отклонил запрос. Вероятная причина — идентификатор точки отгрузки, проверьте его. Если идентификатор верный, попробуйте позже или обратитесь в поддержку.";
    case "request_rejected":
      return "Перевозчик отклонил запрос. Проверьте данные подключения.";
    case "malformed_credentials":
      return "Не хватает данных для подключения. Заполните все поля.";
  }
}
