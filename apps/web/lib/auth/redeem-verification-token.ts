// The client is a PARAMETER and the `@/` alias is absent, for the reason
// `rate-limit.ts` gives: this module must be reachable by a db test running
// outside Next, where the alias does not resolve and the `@oco/db` singleton
// would bind to the developer's database.
import type { PrismaClient } from "@prisma/client";

export type RedeemableVerification = { id: string };

/**
 * The row a presented token belongs to, if that token may still be redeemed.
 * Null for a token that is unknown, already redeemed, overwritten by a resend,
 * or past its expiry — the first three are indistinguishable by construction,
 * because a resend overwrites the column and redemption nulls it.
 */
export async function findRedeemableVerification(
  prisma: PrismaClient,
  token: string,
  now: Date = new Date(),
): Promise<RedeemableVerification | null> {
  const user = await prisma.user.findUnique({
    where: { verificationToken: token },
    select: { id: true, verificationTokenExpiry: true },
  });

  if (!user?.verificationTokenExpiry || user.verificationTokenExpiry < now) {
    return null;
  }
  return { id: user.id };
}

/**
 * Redeem the token ONLY IF the column still holds it. False when it does not.
 *
 * THE WINDOW THIS CLOSES. The read above finds the row by token; the write used
 * to land by `id` alone. A resend arriving between the two overwrote the column
 * with a NEW token — and the old request then confirmed the email and nulled
 * that new token, killing the link the person had just asked for. Reproduced by
 * the race test in `tests/db/verify-email.db.test.mjs`.
 *
 * WHY `updateMany`, in Prisma 6.19.3. The condition must be evaluated by the
 * database in the SAME statement as the write — any read-then-write in
 * application code reopens the window it exists to close. `updateMany` with
 * `{ id, verificationToken }` compiles to one `UPDATE … WHERE "id" = $1 AND
 * "verificationToken" = $2`: Postgres checks and writes as one act, and a
 * resend that got there first simply leaves the WHERE matching nothing. It
 * returns a `count` instead of throwing, so zero rows is an ordinary result to
 * branch on. `update` accepts the same combined where (non-unique filters beside
 * a unique field are generally available since Prisma 5), but reports «no row»
 * by throwing P2025 — the route's catch would still turn that into a refusal,
 * but only by treating an expected outcome as an exception, indistinguishable
 * from a real database failure.
 *
 * `id` sits in the where beside the token although the token is unique on its
 * own: it states which row this write is for — the one the read found — so the
 * condition reads as what it means, «this user, still holding this token».
 */
export async function redeemVerification(
  prisma: PrismaClient,
  userId: string,
  token: string,
): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: { id: userId, verificationToken: token },
    data: {
      emailVerified: true,
      verificationToken: null,
      verificationTokenExpiry: null,
    },
  });
  return count === 1;
}
