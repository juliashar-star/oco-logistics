import { isConnectableByOco } from "./carrier-credential-fields";

/**
 * What the carrier picker offers on one result card.
 *
 * WHY THIS IS A FUNCTION AND NOT A CHAIN OF `&&` IN THE MARKUP. The card used to
 * decide this inline, and got it wrong in a way nobody could see: the request
 * button appeared whenever a carrier was not connected, without ever asking
 * whether OCO can connect that carrier itself. So a seller with no CDEK was
 * invited to «Запросить техническую интеграцию» for CDEK — to ask for a thing
 * that already exists. A decision in markup is a decision no test reaches.
 *
 * THE ONE ПРИЗНАК is a key in CARRIER_CREDENTIAL_FIELDS, and this module derives
 * it rather than restating it.
 *
 * NOT the registry's `connectableViaOco`, and the reason is not that the field
 * is wrong — since 04.09.2026 it is right, `true` on cdek and yataxi only. The
 * reason is what the two are FOR. This map is a fact about the code: a
 * credential bag, a verifier and a form exist. That field is a PROMISE ON THE
 * SHOP WINDOW, read by the public comparison page for a visitor who is not our
 * seller yet. A funnel must turn on the fact, not on the promise. They are kept
 * from drifting by `tests/connectable-via-oco.test.mjs`.
 *
 * NOT the presence of an order adapter either — those are keyed by SERVICE
 * (`yataxi:next_day`, `yataxi:express`, `yataxi:courier`, `cdek:delivery`),
 * while connecting is per carrier.
 */

export type CarrierPickerAction =
  /** Already connected — the card offers nothing. */
  | "none"
  /** OCO can connect this carrier itself: send the seller to the connection tab. */
  | "connect"
  /** OCO cannot connect it yet and no request stands: offer to ask us for it. */
  | "request"
  /** A request already stands — say so, do not offer to send another. */
  | "request_pending"
  /** The carrier stopped operating: nothing to connect and nothing to ask for. */
  | "unavailable";

export type CarrierPickerActionInput = {
  providerKey?: unknown;
  isConnected?: unknown;
  /** ISO string when a request stands, null/absent when none does. */
  pendingRequestAt?: unknown;
  discontinued?: unknown;
};

function isTrue(value: unknown): boolean {
  return value === true;
}

function hasPendingRequest(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * ORDER OF THE CHECKS IS THE DECISION, and each step is here because the one
 * above it would otherwise say something false.
 *
 * 1. `unavailable` first: a discontinued carrier must not be offered a
 *    connection OR a request, and the route refuses both anyway.
 * 2. `none` next: a connected carrier needs nothing, whatever else is true of
 *    it.
 * 3. `connect` BEFORE any request branch. This is the fix. A row in
 *    CarrierConnectionRequest can exist for a carrier we have since learned to
 *    connect — those rows are in the database today — and showing «заявка
 *    отправлена» there would leave the seller waiting for us instead of
 *    connecting in a minute.
 * 4. Only then does a standing request outrank offering a new one.
 *
 * Never throws: an unknown shape yields `request`, the most conservative answer
 * — it neither promises a connection we cannot make nor hides a carrier.
 */
export function describeCarrierPickerAction(
  input: CarrierPickerActionInput = {},
): CarrierPickerAction {
  const source = input ?? {};

  if (isTrue(source.discontinued)) {
    return "unavailable";
  }
  if (isTrue(source.isConnected)) {
    return "none";
  }
  if (
    typeof source.providerKey === "string" &&
    isConnectableByOco(source.providerKey)
  ) {
    return "connect";
  }
  if (hasPendingRequest(source.pendingRequestAt)) {
    return "request_pending";
  }
  return "request";
}

/** True for the actions that mean «мы этого перевозчика сами не подключаем». */
export function isRequestAction(action: CarrierPickerAction): boolean {
  return action === "request" || action === "request_pending";
}
