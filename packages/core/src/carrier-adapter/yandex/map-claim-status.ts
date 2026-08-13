import type { ShipmentStatus } from "@oco/apiship";

/**
 * Nothing before `pickuped` moves the parcel, so everything up to the
 * handover is CREATED and the detail lives in the TrackingEvent row.
 */
const CREATED_KEYS = new Set([
  "new",
  "estimating",
  "ready_for_approval",
  "accepted",
  "performer_lookup",
  "performer_draft",
  "performer_found",
  "pickup_arrived",
  "ready_for_pickup_confirmation",
]);

const IN_TRANSIT_KEYS = new Set([
  "pickuped",
  "delivery_arrived",
  "ready_for_delivery_confirmation",
  // Appears on claim-process but NOT in the OpenAPI ClaimStatus enum — sources
  // disagree. Mapped anyway: an unmapped status silently freezes a row.
  "pay_waiting",
]);

/**
 * AT_PVZ is unreachable in this family by construction — there is no pickup
 * point. No AT_PVZ_KEYS set on purpose.
 */

const DELIVERED_KEYS = new Set(["delivered", "delivered_finish"]);

const RETURNED_KEYS = new Set([
  "returning",
  "return_arrived",
  "ready_for_return_confirmation",
  "returned",
  "returned_finish",
]);

/** Yandex spells cancelled with TWO Ls; ours is CANCELED (one L). */
const CANCELED_KEYS = new Set([
  "cancelled",
  "cancelled_by_taxi",
  "cancelled_with_payment",
  "cancelled_with_items_on_hands",
]);

const PROBLEM_KEYS = new Set([
  "failed",
  "estimating_failed",
  "performer_not_found",
]);

/**
 * Express ClaimStatus → ShipmentStatus. Unknown / blank → null (do not change
 * the row), same contract as mapYandexStatusToShipmentStatus.
 */
export function mapClaimStatusToShipmentStatus(
  status: string,
): ShipmentStatus | null {
  const normalized = status.trim();
  if (!normalized) {
    return null;
  }

  if (CREATED_KEYS.has(normalized)) {
    return "CREATED";
  }
  if (IN_TRANSIT_KEYS.has(normalized)) {
    return "IN_TRANSIT";
  }
  if (DELIVERED_KEYS.has(normalized)) {
    return "DELIVERED";
  }
  if (RETURNED_KEYS.has(normalized)) {
    return "RETURNED";
  }
  if (CANCELED_KEYS.has(normalized)) {
    return "CANCELED";
  }
  if (PROBLEM_KEYS.has(normalized)) {
    return "PROBLEM";
  }

  return null;
}

/**
 * Our Russian label for TrackingEvent.statusText. claims/info carries no
 * human-readable status label — this text is OURS, plain fact, not Yandex
 * product vocabulary. Unknown / blank → null.
 *
 * Prefer «заказ» / «отправление» over «заявка»: the latter is the carrier's
 * word; our screens and this seller-facing text use the same masking rule as
 * the service titles.
 */
const CLAIM_STATUS_TEXT_RU: Readonly<Record<string, string>> = {
  new: "Заказ создан",
  estimating: "Идёт оценка стоимости",
  ready_for_approval: "Оценка готова, ожидает подтверждения",
  accepted: "Заказ подтверждён",
  // Distinct from performer_draft so consecutive TrackingEvent rows do not
  // look like duplicates.
  performer_lookup: "Заказ формируется",
  performer_draft: "Идёт поиск курьера",
  performer_found: "Курьер найден, едет к отправителю",
  pickup_arrived: "Курьер приехал к отправителю",
  ready_for_pickup_confirmation: "Курьер ждёт код подтверждения",
  pickuped: "Посылка у курьера",
  delivery_arrived: "Курьер приехал к получателю",
  ready_for_delivery_confirmation: "Ожидает подтверждения вручения",
  pay_waiting: "Ожидает оплаты при получении",
  delivered: "Доставлено",
  delivered_finish: "Заказ завершён",
  returning: "Посылка возвращается",
  return_arrived: "Курьер на точке возврата",
  ready_for_return_confirmation: "Ожидает подтверждения возврата",
  returned: "Возврат подтверждён",
  returned_finish: "Заказ завершён с возвратом",
  cancelled: "Отменено",
  cancelled_by_taxi: "Отменено курьером",
  cancelled_with_payment: "Отменено с оплатой",
  cancelled_with_items_on_hands: "Отменено, товар остался у курьера",
  failed: "Ошибка, выполнение невозможно",
  estimating_failed: "Оценка не удалась",
  performer_not_found: "Курьер не найден",
};

export function claimStatusTextRu(status: string): string | null {
  const normalized = status.trim();
  if (!normalized) {
    return null;
  }
  // OWN keys only — and here the guard is MANDATORY, not merely correct, which
  // is what separates this lookup from the four others fixed alongside it.
  // Their keys are ours: an adapter key or a provider key we wrote and stored.
  // THIS ONE'S ARGUMENT COMES OUT OF THE CARRIER'S RESPONSE BODY — claims/info
  // `status`, a string we neither choose nor validate — so «a prototype name
  // would have to be passed deliberately» is not an argument that holds. Without
  // the guard the returned Object.prototype member became TrackingEvent
  // .statusText (express-client.ts: `label ?? status`) and the cancel result's
  // description, both of which are stored and shown to the seller.
  return Object.hasOwn(CLAIM_STATUS_TEXT_RU, normalized)
    ? CLAIM_STATUS_TEXT_RU[normalized]
    : null;
}
