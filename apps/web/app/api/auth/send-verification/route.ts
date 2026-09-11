import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db";
import {
  isSendVerificationBlocked,
  recordSendVerificationAttempt,
} from "@/lib/auth/rate-limit";
import {
  isResendCooldownActive,
  issueVerificationToken,
  resendCooldownRemainingSec,
} from "@/lib/auth/verification";
import {
  failedSendMessage,
  SEND_FAILED_TEXT,
} from "@/lib/auth/verification-send-outcome";
import { getClientIp } from "@/lib/http/client-ip";

export async function POST(request: Request) {
  const key = getClientIp(request);
  if (await isSendVerificationBlocked(prisma, key)) {
    return NextResponse.json(
      { error: "Слишком много запросов. Попробуйте через минуту." },
      { status: 429 },
    );
  }

  await recordSendVerificationAttempt(prisma, key);

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  try {
    if (user.emailVerified) {
      return NextResponse.json({ error: "Email уже подтверждён" }, { status: 400 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { verificationTokenExpiry: true },
    });

    if (isResendCooldownActive(dbUser?.verificationTokenExpiry ?? null)) {
      const retryAfter = resendCooldownRemainingSec(dbUser?.verificationTokenExpiry ?? null);
      return NextResponse.json(
        { error: `Подождите ${retryAfter} сек. перед повторной отправкой` },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    const result = await issueVerificationToken(prisma, user.userId, user.email);

    if (result.outcome === "failed") {
      // The reason goes to the log, never to the seller: the operator needs the
      // variable name or the status, the seller needs to know what still works.
      console.error(result.serverLog);
      return NextResponse.json(
        { error: failedSendMessage(result.priorLinkAlive) },
        { status: 503 },
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    console.error("send-verification failed");
    return NextResponse.json({ error: SEND_FAILED_TEXT }, { status: 500 });
  }
}
