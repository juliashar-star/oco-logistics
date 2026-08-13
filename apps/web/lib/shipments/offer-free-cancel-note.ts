import {
  FREE_CANCEL_BOUNDARY_UNKNOWN,
  FREE_CANCEL_UNTIL_COURIER_PICKUP,
  FREE_CANCEL_UNTIL_WAREHOUSE_INTAKE,
} from "@oco/core/carrier-adapter/free-cancel-boundaries";

/** Free until the courier reaches the sender. */
export const FREE_CANCEL_UNTIL_COURIER_PICKUP_RU =
  "Бесплатная отмена — пока курьер не приехал к отправителю.";

/** Free until the parcel is taken in at the carrier's warehouse. */
export const FREE_CANCEL_UNTIL_WAREHOUSE_INTAKE_RU =
  "Бесплатная отмена — пока посылка не поступила на склад перевозчика.";

/**
 * Said when we do not know the boundary. It states what is certainly true of
 * every carrier — that handling the parcel is what ends free cancellation —
 * and names no moment we have not measured.
 */
export const FREE_CANCEL_UNKNOWN_RU =
  "Отмена может стать платной после того, как перевозчик начнёт работу с посылкой.";

const NOTE_BY_BOUNDARY = new Map<string, string>([
  [FREE_CANCEL_UNTIL_COURIER_PICKUP, FREE_CANCEL_UNTIL_COURIER_PICKUP_RU],
  [FREE_CANCEL_UNTIL_WAREHOUSE_INTAKE, FREE_CANCEL_UNTIL_WAREHOUSE_INTAKE_RU],
  [FREE_CANCEL_BOUNDARY_UNKNOWN, FREE_CANCEL_UNKNOWN_RU],
]);

/**
 * The cancellation terms shown on an offer card, before the seller commits.
 * An order is created by ONE press — there is no confirmation screen — so this
 * is the only moment they can learn the terms before agreeing to them.
 *
 * THERE IS ALWAYS A SENTENCE. It never returns "", and the caller must never
 * make it conditional. A warning that appears on some cards and not others is
 * read as a promise about the rest: a seller who sees «бесплатная отмена — пока
 * курьер не приехал» on two cards and nothing on the third concludes that the
 * third one cancels freely for longer. About «Доставку по России» (the
 * request/* family) we have not one measured fact on the subject, so silence
 * there would be the most expensive claim on the whole screen.
 *
 * An absent or unrecognised key gets the same sentence as an explicit
 * "unknown" — a boundary nobody set and a boundary nobody knows are the same
 * thing to the seller, and both are honestly described by the vaguer wording.
 * Never a blank line, which would put a card back into the silent group.
 *
 * Pure so the choice is testable: the card needs React to render, and a rule
 * nothing can exercise is a rule nobody is watching.
 */
export function offerFreeCancelNote(boundary: unknown): string {
  if (typeof boundary !== "string") {
    return FREE_CANCEL_UNKNOWN_RU;
  }
  return NOTE_BY_BOUNDARY.get(boundary.trim()) ?? FREE_CANCEL_UNKNOWN_RU;
}
