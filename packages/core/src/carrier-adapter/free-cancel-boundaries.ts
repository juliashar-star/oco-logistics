/**
 * How long a seller can still cancel an order for free, as a NEUTRAL KEY.
 *
 * Named by what happens to the parcel, never by the carrier that happens to
 * work that way today — the same rule the rest of the registry follows. A key
 * called "cdek_rule" would have to be renamed the moment a second carrier
 * shared the boundary, and it would put a provider name one import away from
 * the browser.
 *
 * NO RUSSIAN HERE. The registry stores the fact; the words a seller reads live
 * in the UI layer (apps/web/lib/shipments/offer-free-cancel-note.ts), exactly
 * as supportsThermalBag stores a boolean and «без термосумки» lives on the card.
 *
 * NOT in types.ts, and no imports of its own — this module is loaded by the
 * browser through the offer card, so it must stay free of anything that drags
 * a carrier client with it (same reasoning as cancel-event-codes.ts).
 */
export type FreeCancelBoundary =
  | "until_courier_pickup"
  | "until_warehouse_intake"
  | "unknown";

/**
 * Free until the courier reaches the SENDER. Measured behaviour of the Express
 * family: cancelExpressOrder asks claims/cancel-info first and gets "free" only
 * while the claim has not moved past pickup.
 */
export const FREE_CANCEL_UNTIL_COURIER_PICKUP: FreeCancelBoundary =
  "until_courier_pickup";

/**
 * Free until the parcel reaches the CARRIER'S WAREHOUSE. This is the boundary
 * cancelCdekOrder draws from «Приложение 1» — DELETE is accepted while the
 * goods have not arrived at the sender's warehouse, and refused after.
 */
export const FREE_CANCEL_UNTIL_WAREHOUSE_INTAKE: FreeCancelBoundary =
  "until_warehouse_intake";

/**
 * WE DO NOT KNOW, and saying so is the point. Nothing in the other-day
 * (request/*) documentation states when cancelling stops being free, and we
 * have not measured it. An adapter that reaches this value is not being
 * lenient — it is admitting a gap, and the seller is warned accordingly.
 */
export const FREE_CANCEL_BOUNDARY_UNKNOWN: FreeCancelBoundary = "unknown";
