/**
 * How the resend button reacts to what `/api/auth/send-verification` answered.
 *
 * PURE and import-free: the button is a client component and there are no
 * component tests in this repository, so the decision lives here, where a unit
 * test reaches it.
 */

export const RESEND_COOLDOWN_SEC = 60;
export const RESEND_FALLBACK_ERROR = "Не удалось отправить письмо";

/** Null in either field means «leave that part of the button as it is». */
export type ResendReaction = { cooldownSec: number | null; error: string | null };

function errorText(body: unknown): string {
  if (
    body !== null &&
    typeof body === "object" &&
    typeof (body as { error?: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }
  return RESEND_FALLBACK_ERROR;
}

export function parseResendResponse(status: number, body: unknown): ResendReaction {
  if (status >= 200 && status < 300) {
    return { cooldownSec: RESEND_COOLDOWN_SEC, error: null };
  }

  const text = errorText(body);

  // TWO DIFFERENT 429s, and they must not be handled alike.
  if (status === 429) {
    const match = text.match(/(\d+)/);
    if (match) {
      // The per-account cooldown («Подождите N сек. перед повторной
      // отправкой»). ONLY the countdown, no red line: the button's own label
      // already carries the same seconds and re-renders itself every second,
      // while a red line would say the same thing in other words and then sit
      // there frozen at the number it was born with.
      return { cooldownSec: Number(match[1]), error: null };
    }
    // The IP limit («Слишком много запросов…») carries no number, so the
    // button cannot be showing it. It must be said out loud; the sixty seconds
    // are our own guess at how long, not something the server told us.
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
