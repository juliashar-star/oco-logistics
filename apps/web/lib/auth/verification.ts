import { randomUUID } from "crypto";
// NOT a parameter, unlike the client. `packages/core/lib/email.ts` imports
// nothing and reaches the provider through the global `fetch`, so a test
// replaces `fetch` rather than the sender.
import { sendVerificationEmail } from "@oco/core";
// The client is a PARAMETER, and the `@/` alias is deliberately absent. Both for
// the same reason: this module must be reachable by a db test running outside
// Next, where the alias does not resolve and where the `@oco/db` singleton would
// bind to the DEVELOPER's database. Same reason as the services in `lib/shipments`
// and `lib/carriers`, which have taken their client this way from the start.
import type { PrismaClient } from "@prisma/client";
import {
  isPriorLinkAlive,
  planAfterSend,
  rollbackData,
  sendFailureServerLog,
  type PriorVerification,
  type RollbackResult,
} from "./verification-send-outcome";

export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;

export function verificationTokenIssuedAt(expiry: Date): Date {
  return new Date(expiry.getTime() - VERIFICATION_TOKEN_TTL_MS);
}

export function isResendCooldownActive(expiry: Date | null | undefined): boolean {
  if (!expiry) return false;
  const issuedAt = verificationTokenIssuedAt(expiry);
  return Date.now() - issuedAt.getTime() < VERIFICATION_RESEND_COOLDOWN_MS;
}

export function resendCooldownRemainingSec(expiry: Date | null | undefined): number {
  if (!expiry) return 0;
  const issuedAt = verificationTokenIssuedAt(expiry);
  const remaining = VERIFICATION_RESEND_COOLDOWN_MS - (Date.now() - issuedAt.getTime());
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/**
 * `failed` carries what each caller needs and nothing more: whether the link in
 * the previous letter still works (for the seller's message) and one line for
 * the operator's log, in the form of `serverLog` in connect-result-response.ts.
 */
export type IssueVerificationResult =
  | { outcome: "sent" }
  | { outcome: "failed"; priorLinkAlive: boolean; serverLog: string };

/**
 * Writes a new token, sends the letter, and — ONLY when non-delivery is
 * proven — puts the previous token back.
 *
 * THE DEFECT THIS ANSWERS. The new token used to be written before the send and
 * left in place whatever happened, so a failed send killed the link in the
 * previous letter and delivered no new one: the seller was left with no working
 * link at all.
 *
 * WHY ONLY ON PROVEN NON-DELIVERY. When delivery is not established — a
 * rejected request, an HTTP 5xx, a 2xx with an unreadable body — the letter may
 * have gone out carrying the NEW token. Rolling back then would kill the one
 * link that works. So on «not established» the new token stays, exactly as
 * before this change; see `classifyVerificationSend` for where the line runs.
 *
 * The client is the first argument so that a db test can hand over its own:
 * tests/db/issue-verification-token.db.test.mjs runs this function against the
 * test database, conditional rollback included, with `fetch` replaced.
 */
export async function issueVerificationToken(
  prisma: PrismaClient,
  userId: string,
  email: string,
): Promise<IssueVerificationResult> {
  // Read BEFORE the write. `update` returns the row as it is AFTER the change,
  // so the previous values can only be had by asking first. Both may be null:
  // at registration the user was created without either column.
  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { verificationToken: true, verificationTokenExpiry: true },
  });
  const prior: PriorVerification = {
    token: before?.verificationToken ?? null,
    expiry: before?.verificationTokenExpiry ?? null,
  };

  const token = randomUUID();
  const verificationTokenExpiry = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

  // UNCONDITIONAL, deliberately. The newest send wins: two resends racing each
  // other both write, and the later write stands. Making this write conditional
  // on the previous token would turn a concurrent resend into a refusal — a
  // different rule, and not this change's to make.
  await prisma.user.update({
    where: { id: userId },
    data: {
      verificationToken: token,
      verificationTokenExpiry,
    },
  });

  const sent = await sendVerificationEmail(email, token);
  if (sent.delivery === "sent") {
    return { outcome: "sent" };
  }

  let rollback: RollbackResult = "not_attempted";
  if (planAfterSend(sent.delivery) === "rollback") {
    // CONDITIONAL, and the condition is OUR token. If the column no longer
    // holds it, someone wrote after us — another resend — and their value is
    // the one that stands: zero rows updated is not an error, it is that. A
    // blind rollback here would erase their token, and with it a letter that
    // may already be in the seller's inbox.
    const { count } = await prisma.user.updateMany({
      where: { id: userId, verificationToken: token },
      data: rollbackData(prior),
    });
    rollback = count === 1 ? "done" : "skipped";
  }

  return {
    outcome: "failed",
    priorLinkAlive: isPriorLinkAlive({
      rolledBack: rollback === "done",
      prior,
      now: new Date(),
    }),
    serverLog: sendFailureServerLog({ reason: sent.reason, rollback }),
  };
}
