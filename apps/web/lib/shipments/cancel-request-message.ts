/** Shown when the route failed but told us nothing usable. */
export const CANCEL_REQUEST_FALLBACK_ERROR_RU =
  "Не удалось отменить заказ. Обновите страницу или попробуйте позже.";

/** Shown when the carrier accepted the cancellation request. */
export const CANCEL_REQUEST_SUCCESS_RU =
  "Запрос на отмену отправлен. Статус изменится, когда перевозчик его обработает.";

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
