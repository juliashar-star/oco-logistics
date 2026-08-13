import {
  OCO_CANCEL_ALREADY_REQUESTED,
  OCO_CANCEL_ALREADY_REQUESTED_TEXT_RU,
  OCO_CANCEL_REQUESTED,
  OCO_CANCEL_REQUESTED_TEXT_RU,
} from "@oco/core/carrier-adapter/cancel-event-codes";

/** Shown when the route failed but told us nothing usable. */
export const CANCEL_REQUEST_FALLBACK_ERROR_RU =
  "Не удалось отменить заказ. Обновите страницу или попробуйте позже.";

/**
 * Shown when the carrier accepted the cancellation request and the result named
 * no case of ours. It is the general sentence, not the default meaning: a
 * carrier that told us something more specific gets its own line below.
 */
export const CANCEL_REQUEST_SUCCESS_RU =
  "Запрос на отмену отправлен. Статус изменится, когда перевозчик его обработает.";

/**
 * The OCO_* cases that have a sentence of their own. A Map, not an object
 * literal: a reason of "constructor" or "toString" would find a value on
 * Object.prototype and be shown to the seller as a message.
 */
const CANCEL_NOTICE_BY_REASON = new Map<string, string>([
  [OCO_CANCEL_REQUESTED, OCO_CANCEL_REQUESTED_TEXT_RU],
  [OCO_CANCEL_ALREADY_REQUESTED, OCO_CANCEL_ALREADY_REQUESTED_TEXT_RU],
]);

/**
 * What the seller is shown after a SUCCESSFUL POST /api/shipments/[id]/cancel.
 *
 * THE DECISION IS MADE ON THE REASON CODE, AND THE CARRIER'S `description` IS
 * NEVER READ — that is the whole point of this function, not an oversight.
 * CarrierCancelResult.description is ours only for CDEK and the Express
 * fallback; for the request/* family (yataxi:next_day) both `reason` and
 * `description` are copied straight out of Yandex's response body
 * (yandex/client.ts, the cancelOrder success branch). Forwarding a provider
 * string into a green banner would put untranslated carrier vocabulary — and
 * whatever else that body happens to echo — in front of the seller. So only
 * codes WE issue produce a specific sentence; a code we do not know, including
 * every Yandex one, falls to the general sentence, which is true of all of them.
 *
 * The general sentence is also the answer when there is no reason at all: the
 * cancellation still succeeded, we simply have nothing more precise to say.
 *
 * `unknown` on purpose — the route hands it a value typed `string | undefined`,
 * but the same function guards the seller from a malformed body too.
 */
export function cancelRequestNoticeMessage(reason: unknown): string {
  if (typeof reason !== "string") {
    return CANCEL_REQUEST_SUCCESS_RU;
  }
  return CANCEL_NOTICE_BY_REASON.get(reason.trim()) ?? CANCEL_REQUEST_SUCCESS_RU;
}

/**
 * What the seller is shown after a failed POST /api/shipments/[id]/cancel.
 *
 * THE ROUTE'S MESSAGE WINS WHENEVER THERE IS ONE, and that is a deliberate
 * departure from the handlers beside it. delete-draft ignores `data.error` and
 * shows a fixed sentence; here that would be actively harmful. The cancel
 * route's 409s are the only place the seller learns WHY — that free
 * cancellation is no longer possible, that the order is already finished, or
 * that we cannot identify the carrier. Replacing those with «попробуйте позже»
 * would tell them to retry something that will never succeed.
 *
 * Pure so the decision is testable: the surrounding handler needs a browser,
 * fetch and React to run, and a rule nothing can exercise is a rule nobody is
 * watching.
 */
export function cancelRequestErrorMessage(body: unknown): string {
  if (body === null || typeof body !== "object") {
    return CANCEL_REQUEST_FALLBACK_ERROR_RU;
  }
  const raw = (body as { error?: unknown }).error;
  if (typeof raw !== "string") {
    return CANCEL_REQUEST_FALLBACK_ERROR_RU;
  }
  const trimmed = raw.trim();
  // A blank message is not a message. Showing "" would leave an empty red
  // panel — visibly broken, and saying less than the fallback does.
  return trimmed === "" ? CANCEL_REQUEST_FALLBACK_ERROR_RU : trimmed;
}
