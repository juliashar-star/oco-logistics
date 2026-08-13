/**
 * Event codes ОСО writes about cancellations. Neutral by design — a code named
 * OCO_* is an OCO concept, not any one carrier's, and it now has two producers
 * (CDEK's cancelCdekOrder and Yandex Express's cancelExpressOrder fallback).
 *
 * NOT in types.ts on purpose: that file is strictly types — 27 exported
 * type/interface declarations, no runtime value anywhere, and every importer
 * uses `import type`. Putting a const there would force those call sites into
 * value imports.
 */

/**
 * OURS, not a carrier status — same shape as OCO_DELIVERY_DATE_CHANGED.
 * «ОСО asked the carrier to cancel; the carrier accepted the request.»
 *
 * It is namespaced precisely so it can never be mistaken for a carrier's own
 * code. CDEK is the reason it exists: the DELETE envelope's request state is
 * ACCEPTED, and CDEK order status 0 is ALSO ACCEPTED («Принят»), which
 * mapCdekStatusToShipmentStatus maps to CREATED — so the bare word in a
 * statusCode column read as an order status that never happened. No carrier
 * status mapper knows this code, so writing the event never changes
 * Shipment.status.
 */
export const OCO_CANCEL_REQUESTED = "OCO_CANCEL_REQUESTED";

/**
 * The seller-facing line that accompanies it. One constant, because both
 * producers mean exactly the same thing by it and two copies would drift.
 *
 * It promises only what is true: the cancellation was asked for, and what
 * happens next is the carrier's. It does NOT say the order is cancelled — for
 * both carriers the accepted request is not the outcome.
 *
 * NO TIMING PROMISE, and that is the point of the current wording. The previous
 * line said «Подтверждение придёт со следующим обновлением статуса», which the
 * 13.08 probe measured to be a promise we cannot keep: a day after our DELETE
 * the CDEK order answered 200 with statuses[] untouched (newest still CREATED)
 * while requests[] carried { type: "DELETE", state: "ACCEPTED" } — the request
 * sat queued and no status update came. Saying the outcome depends on the
 * carrier, and saying nothing about when, stays true whether or not that stall
 * was an edu-contour artefact.
 */
export const OCO_CANCEL_REQUESTED_TEXT_RU =
  "Отмена запрошена у перевозчика. Статус обновится, когда перевозчик её обработает.";

/**
 * OURS, like the code above: «a cancellation was already asked for earlier and
 * the carrier has not finished with it yet».
 *
 * MEASURED 13.08 on the CDEK edu contour: a day after our DELETE the order was
 * unchanged — statuses[] still ended at CREATED, so the boundary rule still read
 * it as deletable, while requests[] carried { type: "DELETE", state: "ACCEPTED" }.
 * Without this the seller's second press would queue a duplicate deletion and
 * the timeline would claim a fresh request had been sent.
 *
 * Distinct from OCO_CANCEL_REQUESTED on purpose: «we asked just now» and «you
 * already asked, it is still being processed» are different facts, and the
 * seller is told them in different words — the two codes pick two different
 * banner sentences (cancelRequestNoticeMessage).
 *
 * THE DIFFERENCE LIVES IN THE BANNER, NOT IN THE TIMELINE, and the timeline
 * says its part by staying still: this code makes resolveCancelTrackingEvent
 * write nothing, because no request was made and a row would report an approach
 * to the carrier that never happened. The absent row IS the signal that nothing
 * new occurred — repeating the earlier one per press would say the opposite.
 */
export const OCO_CANCEL_ALREADY_REQUESTED = "OCO_CANCEL_ALREADY_REQUESTED";

/**
 * Says the request is already in the queue and that pressing again changes
 * nothing — and promises no date, because the carrier gives none.
 */
export const OCO_CANCEL_ALREADY_REQUESTED_TEXT_RU =
  "Запрос на отмену уже отправлен ранее и ещё обрабатывается перевозчиком. Отправлять его повторно не нужно.";
