/**
 * What happens after a verification letter could not be confirmed as sent.
 *
 * PURE and import-free, so every choice here is reachable by a unit test in
 * milliseconds. `issueVerificationToken` performs the database writes; this
 * module only decides them.
 */

/** How a send ended, as `sendVerificationEmail` reports it. */
export type SendDelivery = "sent" | "not_sent" | "unknown";

/** The token columns as they stood before a new token was written. */
export type PriorVerification = { token: string | null; expiry: Date | null };

/** How the conditional rollback went, for the operator's log line. */
export type RollbackResult = "done" | "skipped" | "not_attempted";

export const SEND_FAILED_TEXT = "Не удалось отправить письмо. Попробуйте позже.";
export const PRIOR_LINK_ALIVE_TEXT =
  "Не удалось отправить новое письмо. Ссылка из предыдущего письма по-прежнему действует.";

/**
 * Roll back ONLY when non-delivery is proven. On «not established» the letter
 * may have gone out carrying the new token, and rolling back would kill the one
 * link that works — so the new token stays, as it always did.
 */
export function planAfterSend(delivery: SendDelivery): "keep" | "rollback" {
  return delivery === "not_sent" ? "rollback" : "keep";
}

/**
 * The values to write back. Both columns are nullable, and a null is restored
 * as a null: after a failed FIRST letter the row returns to exactly what it was
 * before any token was issued.
 */
export function rollbackData(prior: PriorVerification): {
  verificationToken: string | null;
  verificationTokenExpiry: Date | null;
} {
  return {
    verificationToken: prior.token,
    verificationTokenExpiry: prior.expiry,
  };
}

/**
 * Whether the link in the previous letter works after this failed attempt.
 * True only when all three hold: the rollback actually landed, there was a
 * previous token, and its expiry has not passed.
 */
export function isPriorLinkAlive(args: {
  rolledBack: boolean;
  prior: PriorVerification;
  now: Date;
}): boolean {
  const { rolledBack, prior, now } = args;
  return (
    rolledBack &&
    prior.token !== null &&
    prior.expiry !== null &&
    prior.expiry.getTime() > now.getTime()
  );
}

/**
 * Two texts, and the second is said only when it is true. A seller whose
 * previous link still works does not need to try again — they need to know
 * the old letter is still good. Everywhere else — a first letter, an expired
 * link, a rollback someone else's resend overtook, a delivery not established —
 * today's text stands unchanged.
 */
export function failedSendMessage(priorLinkAlive: boolean): string {
  return priorLinkAlive ? PRIOR_LINK_ALIVE_TEXT : SEND_FAILED_TEXT;
}

const ROLLBACK_NOTE: Readonly<Record<RollbackResult, string>> = {
  done: "the previous token was restored, so the link in the last delivered letter works again",
  skipped:
    "rollback skipped: a later request had already written the token column, and its value was left in place",
  not_attempted: "the new token was kept, because the letter may have been delivered",
};

/**
 * The operator-facing line, in the form `connect-result-response.ts` uses for
 * its `serverLog`: a bracketed area, what went wrong, what it means now. It is
 * built from the sender's `reason` — variable NAMES, an HTTP status, an error
 * code — and never from a value, a response body or the seller's address.
 */
export function sendFailureServerLog(args: {
  reason: string;
  rollback: RollbackResult;
}): string {
  return `[auth/verification-email] ${args.reason}; ${ROLLBACK_NOTE[args.rollback]}`;
}
