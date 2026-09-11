/**
 * What a seller is told when an APIShip call fails — and what the operator is
 * told instead.
 *
 * THE PROVIDER'S TEXT NEVER REACHES THE SELLER. `ApishipError.message` is built
 * from APIShip's own `description` / `message` fields
 * (packages/integrations/apiship/src/client.ts, auth.ts), and those can echo
 * what was submitted — a recipient's name, phone, address. CLAUDE.md forbids
 * putting a provider body into an error message. So the seller always gets the
 * route's own refusal — the wording each route already used as its fallback —
 * and the reason goes to the server log.
 *
 * THE MESSAGE DOES NOT GO TO THE LOG EITHER. Some ApishipErrors carry the raw
 * reply in the message and no status at all (client.ts builds one from
 * `JSON.stringify` of an unrecognised /orders/status answer), so no message is
 * safe to log. The log line gets the HTTP status and the error's `code` — and
 * the code only when it looks like a code, because it too is read from the
 * provider's body. The shape is `serverLog` in connect-result-response.ts: a
 * bracketed area, what happened, what the seller was told.
 *
 * PURE and import-free, so a unit test reaches it without auth, Prisma, Next or
 * the APIShip package: the routes pass their `ApishipError` in, and this module
 * reads only its fields.
 */

export type ApishipRoute =
  | "shipments/intervals"
  | "shipments/create"
  | "shipments/calculate"
  | "shipments/points";

/** The fields of an `ApishipError` this module reads. */
export type ApishipFailure = {
  message?: unknown;
  statusCode?: unknown;
  code?: unknown;
};

/** Each route's own refusal — the wording it already used as its fallback. */
export const APISHIP_REFUSAL_TEXT: Readonly<Record<ApishipRoute, string>> = {
  "shipments/intervals":
    "Не удалось получить интервалы доставки. Проверьте адреса и параметры посылки.",
  "shipments/create":
    "Не удалось создать отправление. Проверьте данные и попробуйте снова.",
  "shipments/calculate":
    "Не удалось рассчитать тарифы. Проверьте адреса и параметры посылки.",
  "shipments/points": "Не удалось получить список ПВЗ",
};

export type ApishipFailureResponse = {
  httpStatus: 502;
  body: { error: string };
  /** Emitted to the server log by the route. Carries no provider text. */
  serverLog: string;
};

// The same shape packages/core/lib/email.ts accepts as a code: upper-case
// letters, digits and underscores, nothing that can hold a name or an address.
const CODE_LIKE = /^[A-Z][A-Z0-9_]{1,63}$/;

function statusPart(statusCode: unknown): string {
  return typeof statusCode === "number" && Number.isInteger(statusCode)
    ? `APIShip answered HTTP ${statusCode}`
    : "APIShip call failed without an HTTP status";
}

function codePart(code: unknown): string {
  if (code === undefined || code === null || code === "") return "";
  return typeof code === "string" && CODE_LIKE.test(code)
    ? ` (code ${code})`
    : " (code withheld: not code-like)";
}

export function apishipFailureResponse(
  error: ApishipFailure,
  route: ApishipRoute,
): ApishipFailureResponse {
  return {
    httpStatus: 502,
    body: { error: APISHIP_REFUSAL_TEXT[route] },
    serverLog: `[${route}] ${statusPart(error.statusCode)}${codePart(error.code)}; the seller was given the route's own refusal and the provider's text was withheld`,
  };
}
