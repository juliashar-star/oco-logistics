/**
 * Which settings tab the link beside a new-order error opens, or null for none.
 *
 * PURE, with no runtime import: the form (a client component) and two routes
 * both import this module, so the code a route issues and the code the form
 * reads are one constant, not two spellings — the shape of
 * RESEND_REFUSAL_REASON in apps/web/lib/auth/parse-resend-response.ts. The one
 * import below is a type and is erased before either bundle sees it.
 *
 * DECIDED BY A CODE, NEVER BY THE WORDS. Until slice E10 the form looked for
 * three Russian substrings in whatever the error said and, on a match, always
 * opened «Компания». Measured before the change: the link appeared for an
 * amount typed on the form itself, for a malformed request and for a failure of
 * ours; it was missing for expired credentials at submission; and every message
 * about a carrier connection opened the tab holding the sender address, where
 * there is nothing to connect. Rewording any of those sentences would also have
 * moved the link silently.
 *
 * TWO CODES, because the seller has two different things to do: fix a carrier
 * connection, or complete the sender details. The code names the reason, not
 * the tab — which tab it opens is decided here, on the reading side.
 *
 * NO CODE → NO LINK. Absence is the ordinary case, not an exceptional one: most
 * errors this form can show need no link, and they arrive without a code. The
 * substrings are NOT kept as a fallback — for all of those errors a fallback
 * would be the old rule again, wrong links included. The words are always shown
 * in full, so a missing link hides nothing; a wrong link sends the seller to the
 * wrong page. The server's sentences are unchanged, so a tab still running an
 * older bundle reads them exactly as before.
 */
import type { BuildOfferInputResult } from "./build-offer-input";

export const SETTINGS_LINK_REASON = {
  carrierConnection: "carrier_connection",
  senderIncomplete: "sender_incomplete",
} as const;

export type SettingsLinkReason =
  (typeof SETTINGS_LINK_REASON)[keyof typeof SETTINGS_LINK_REASON];

export type SettingsTab = "company" | "connection";

/** The `reason` field of a response body, if it is a code this form knows. */
export function readSettingsLinkReason(body: unknown): SettingsLinkReason | null {
  if (body === null || typeof body !== "object") {
    return null;
  }
  const value = (body as Record<string, unknown>).reason;
  return value === SETTINGS_LINK_REASON.carrierConnection ||
    value === SETTINGS_LINK_REASON.senderIncomplete
    ? value
    : null;
}

/**
 * The tab for the error the form is showing. Reads the code only — the text
 * travels in the same state object and is deliberately not consulted.
 */
export function settingsLinkTab(error: { reason: unknown }): SettingsTab | null {
  switch (error.reason) {
    case SETTINGS_LINK_REASON.carrierConnection:
      return "connection";
    case SETTINGS_LINK_REASON.senderIncomplete:
      return "company";
    default:
      return null;
  }
}

type BuildFailureReason = Extract<BuildOfferInputResult, { ok: false }>["reason"];

/**
 * The code for a refused offer input. ONE function for both routes that build
 * one — `[id]/offers` and `[id]/submit` each carry their own copy of
 * `messageForBuildFailure`, and a second copy of this decision would be a
 * second place for the two to drift.
 *
 * Only the sender fields live in settings. A declared value is typed on the
 * form itself, a missing destination is chosen there too, and a draft without
 * an idempotency key cannot be fixed anywhere by the seller.
 */
export function settingsLinkReasonForBuildFailure(
  reason: BuildFailureReason,
): SettingsLinkReason | null {
  switch (reason) {
    case "no_sender":
    case "no_sender_phone":
      return SETTINGS_LINK_REASON.senderIncomplete;
    case "no_declared_value":
    case "no_idempotency_key":
    case "no_destination":
      return null;
  }
}
