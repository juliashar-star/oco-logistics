/**
 * Where a refused verification link sends the person, and what the dashboard
 * says when it lands there.
 *
 * PURE, and deliberately free of imports: the route decides with it on the
 * server, the dashboard toast reads its text in the browser, a test reaches
 * both in milliseconds, and nothing here can pull a server-only module into
 * anyone's bundle.
 *
 * THE `already` VALUE IS ISSUED AND READ THROUGH THIS MODULE ONLY. The route
 * builds its destination from VERIFIED_ALREADY_PATH and the toast looks the
 * value up in the table below; spelled separately on each side, a rename on one
 * would leave the other matching nothing — no error, just a seller who is told
 * nothing. The older `true` value is still spelled inline in the route's
 * success redirect, as it was before this module existed; only the toast's
 * reading of it moved here.
 */

/** The only thing this decision needs to know about the session. */
export type SessionUserForRefusal = { emailVerified: boolean } | null;

const VERIFIED_ALREADY = "already";

export const VERIFY_ERROR_PATH = "/verify-email/error";
export const VERIFY_STALE_PATH = "/verify-email?stale=1";
export const VERIFIED_ALREADY_PATH = `/dashboard?verified=${VERIFIED_ALREADY}`;

/**
 * Three destinations for a refused link:
 * - no session → the error page: there is nothing to offer someone we cannot
 *   name;
 * - signed in, email NOT yet confirmed → the page holding the resend button;
 * - signed in, email ALREADY confirmed → the dashboard, with a toast.
 *
 * ALREADY CONFIRMED IS ITS OWN CASE — found in a live check 11.09.2026. A
 * confirmed seller who followed an old link was sent to the stale page, which
 * saw the confirmed email and redirected to the dashboard in silence: they
 * followed a link and nothing on the screen said anything. The link was not
 * the problem — the email was already done — so the answer is the dashboard,
 * and a line saying so.
 */
export function refusedVerificationDestination(
  user: SessionUserForRefusal,
): string {
  if (user === null) {
    return VERIFY_ERROR_PATH;
  }
  if (user.emailVerified) {
    return VERIFIED_ALREADY_PATH;
  }
  return VERIFY_STALE_PATH;
}

/**
 * What the dashboard toast says for each `?verified=` value it understands.
 *
 * A Map, not an object literal: the value arrives from the address bar, and an
 * object indexed with it would resolve `constructor` or `__proto__` through the
 * prototype chain to something truthy that is not a message.
 */
const VERIFIED_TOAST_TEXT: ReadonlyMap<string, string> = new Map([
  ["true", "Email подтверждён ✓"],
  [VERIFIED_ALREADY, "Email уже подтверждён — ссылка больше не нужна."],
]);

/** The toast text for a `?verified=` value, or null for anything we never issue. */
export function verifiedToastText(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  return VERIFIED_TOAST_TEXT.get(value) ?? null;
}
