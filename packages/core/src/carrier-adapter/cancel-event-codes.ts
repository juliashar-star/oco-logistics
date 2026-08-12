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
 * It promises only what is true: the request was sent, and confirmation comes
 * later through the ordinary status sync. It does NOT say the order is
 * cancelled — for both carriers the accepted request is not the outcome.
 */
export const OCO_CANCEL_REQUESTED_TEXT_RU =
  "Запрос на отмену отправлен перевозчику. Подтверждение придёт со следующим обновлением статуса.";
