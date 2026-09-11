import { NextResponse } from "next/server";
import {
  isVerifyEmailBlocked,
  recordVerifyEmailAttempt,
} from "@/lib/auth/rate-limit";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  findRedeemableVerification,
  redeemVerification,
} from "@/lib/auth/redeem-verification-token";
import {
  refusedVerificationDestination,
  type SessionUserForRefusal,
} from "@/lib/auth/verification-redirects";
import { getClientIp } from "@/lib/http/client-ip";
import { prisma } from "@/lib/db";

/**
 * Where a refused link sends the person, and why it depends on the session.
 *
 * A DEAD END WAS THE DEFECT. Every refusal used to land on
 * `/verify-email/error`, a page that takes no arguments and can only say the
 * link is bad. But a refusal is reached ONLY by someone who is signed in:
 * `/verify-email` is a protected path (`middleware.ts`), so a visitor without a
 * session is redirected to `/login` before the token ever reaches this route —
 * and the query string, token and all, is dropped on the way. So the person
 * standing in front of the error page is one we can identify.
 *
 * Three destinations, decided by `refusedVerificationDestination`:
 * - not signed in → the old error page, unchanged: there is nothing to offer
 *   someone we cannot name, and the page still has to exist for the rate-limit
 *   refusal below;
 * - signed in, email NOT yet confirmed → `/verify-email?stale=1`, the page that
 *   already knows their address, holds «Отправить повторно», and says one line
 *   about the link;
 * - signed in, email ALREADY confirmed → `/dashboard?verified=already`, where
 *   the dashboard's toast says the link is simply no longer needed.
 *
 * The third case is why this comment was rewritten. It used to say that anyone
 * signed in lands on the page with the resend button — false for someone whose
 * email was already confirmed: that page saw the confirmed email and redirected
 * to the dashboard in silence, so the person followed a link and saw nothing
 * happen at all.
 *
 * NEVER THROWS. `getCurrentUser` reads the database, and this helper is called
 * from a catch block among others. If it fails we fall back to the error page:
 * this route's contract is that it answers with a redirect, always.
 */
async function refusedRedirect(request: Request): Promise<NextResponse> {
  let user: SessionUserForRefusal = null;
  try {
    user = await getCurrentUser();
  } catch {
    console.error("verify-email: session read failed while refusing");
  }
  return NextResponse.redirect(
    new URL(refusedVerificationDestination(user), request.url),
  );
}

export async function GET(request: Request) {
  // NO SESSION READ HERE, so the IP is all there is. Every attempt counts: a
  // correct token and a wrong one differ only by which page the browser lands
  // on, so counting failures alone would leave the guessing unmetered.
  const key = getClientIp(request);
  if (await isVerifyEmailBlocked(prisma, key)) {
    // THE ONE REFUSAL THAT DOES NOT USE refusedRedirect, deliberately. It
    // answers with redirects only; a 429 body here would be the one response
    // that tells an attacker their guessing was noticed — and so, now, would a
    // redirect to either of the pages refusedRedirect can choose instead of the
    // error page. Someone burning through tokens must not be able to tell
    // «blocked» from «wrong token», and the session is not read at all on this
    // branch, so nothing about them leaks either way.
    return NextResponse.redirect(new URL("/verify-email/error", request.url));
  }
  await recordVerifyEmailAttempt(prisma, key);

  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim();

  if (!token) {
    // Unreachable through the interface — the page only forwards here when a
    // token is present — so this is a hand-made request. Treated like any other
    // refusal rather than given a rule of its own: a second rule is a second
    // thing to keep in step, and the page's wording claims no cause anyway.
    return await refusedRedirect(request);
  }

  try {
    // Unknown, overwritten by a resend, already redeemed, or expired — all four
    // come back as null. The first three are INDISTINGUISHABLE here and in the
    // database: a resend overwrites the column and redemption nulls it, so all
    // three arrive as no row at all.
    const found = await findRedeemableVerification(prisma, token);
    if (!found) {
      return await refusedRedirect(request);
    }

    // CONDITIONAL, and the condition is the token itself — see
    // redeemVerification. False means a resend overwrote the column between the
    // read above and this write: the link the person followed is no longer the
    // live one, which is exactly a stale link and is answered the same way.
    const redeemed = await redeemVerification(prisma, found.id, token);
    if (!redeemed) {
      return await refusedRedirect(request);
    }

    return NextResponse.redirect(new URL("/dashboard?verified=true", request.url));
  } catch {
    console.error("verify-email failed");
    return await refusedRedirect(request);
  }
}
