import { NextResponse } from "next/server";
import {
  isVerifyEmailBlocked,
  recordVerifyEmailAttempt,
} from "@/lib/auth/rate-limit";
import { getClientIp } from "@/lib/http/client-ip";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  // NO SESSION HERE, so the IP is all there is. Every attempt counts: a correct
  // token and a wrong one differ only by which page the browser lands on, so
  // counting failures alone would leave the guessing unmetered.
  const key = getClientIp(request);
  if (await isVerifyEmailBlocked(prisma, key)) {
    // THE SAME REDIRECT AS EVERY OTHER REFUSAL OF THIS ROUTE. It answers with
    // redirects only; a 429 body here would be the one response that tells an
    // attacker their guessing was noticed.
    return NextResponse.redirect(new URL("/verify-email/error", request.url));
  }
  await recordVerifyEmailAttempt(prisma, key);

  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim();

  if (!token) {
    return NextResponse.redirect(new URL("/verify-email/error", request.url));
  }

  try {
    const user = await prisma.user.findUnique({
      where: { verificationToken: token },
      select: {
        id: true,
        verificationTokenExpiry: true,
      },
    });

    if (!user?.verificationTokenExpiry || user.verificationTokenExpiry < new Date()) {
      return NextResponse.redirect(new URL("/verify-email/error", request.url));
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpiry: null,
      },
    });

    return NextResponse.redirect(new URL("/dashboard?verified=true", request.url));
  } catch {
    console.error("verify-email failed");
    return NextResponse.redirect(new URL("/verify-email/error", request.url));
  }
}
