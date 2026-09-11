/**
 * How the resend button reacts to what `/api/auth/send-verification` answered.
 *
 * PURE and import-free: the button is a client component and there are no
 * component tests in this repository, so the decision lives here, where a unit
 * test reaches it. The route imports the refusal codes from here as well, so the
 * value it issues and the value this module reads are one constant, not two
 * spellings that could drift apart.
 */

export const RESEND_COOLDOWN_SEC = 60;
export const RESEND_FALLBACK_ERROR = "Не удалось отправить письмо";

/**
 * Machine codes for the two 429s, sent in a `reason` field beside `error` — the
 * form `carrier-picker/recommend` already uses (`no_active_carrier`,
 * `weight_required`). The words are for the seller; these are for the code.
 */
export const RESEND_REFUSAL_REASON = {
  cooldown: "resend_cooldown",
  ipLimit: "ip_rate_limited",
} as const;

/** Null in either field means «leave that part of the button as it is». */
export type ResendReaction = { cooldownSec: number | null; error: string | null };

function readField(body: unknown, key: string): unknown {
  if (body === null || typeof body !== "object") return undefined;
  return (body as Record<string, unknown>)[key];
}

function errorText(body: unknown): string {
  const error = readField(body, "error");
  return typeof error === "string" ? error : RESEND_FALLBACK_ERROR;
}

/** A positive whole number of seconds, or null — never a guess. */
function retryAfterSec(body: unknown): number | null {
  const value = readField(body, "retryAfterSec");
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

export function parseResendResponse(status: number, body: unknown): ResendReaction {
  if (status >= 200 && status < 300) {
    return { cooldownSec: RESEND_COOLDOWN_SEC, error: null };
  }

  const text = errorText(body);

  // TWO DIFFERENT 429s, and they must not be handled alike. They are told apart
  // by the `reason` field, NEVER by the words: reading a number out of the text
  // tied the button to one sentence, and rewording it on the server would have
  // silently swapped the branches.
  if (status === 429) {
    const seconds = retryAfterSec(body);
    if (readField(body, "reason") === RESEND_REFUSAL_REASON.cooldown && seconds !== null) {
      // The per-account cooldown. ONLY the countdown, no red line: the button's
      // own label already carries the same seconds and re-renders itself every
      // second, while a red line would say the same thing in other words and
      // then sit there frozen at the number it was born with.
      return { cooldownSec: seconds, error: null };
    }
    // Everything else is said OUT LOUD. The IP limit (`ip_rate_limited`) carries
    // no seconds, so the button cannot be showing it; the sixty are our own
    // guess at how long, not something the server told us.
    //
    // THE SAME BRANCH takes a 429 whose `reason` is missing or unknown, or a
    // cooldown without usable seconds — an answer from a server older than this
    // field, a cached one, a code added later. A silent countdown is the worst
    // outcome available there: the label changes exactly as it does after a
    // successful send, and the seller concludes the letter went. So when the
    // code cannot be read, the words are shown — even on a cooldown, where they
    // may name a different number than the pause the button counts down.
    // (An older BUNDLE in an open tab is the other direction: it still reads the
    // text, which is why the server's words are kept unchanged.)
    return { cooldownSec: RESEND_COOLDOWN_SEC, error: text };
  }

  // 503 and 500: the send failed. The pause keeps the button from being pressed
  // straight back into the same failure. It is a CLIENT pause only — after a
  // rollback the server's own cooldown follows the previous letter, and a page
  // reload clears this one. The server-side cap that remains is the IP limit.
  if (status === 503 || status === 500) {
    return { cooldownSec: RESEND_COOLDOWN_SEC, error: text };
  }

  return { cooldownSec: null, error: text };
}
