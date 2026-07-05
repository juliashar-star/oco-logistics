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
import { getClientIp } from "@/lib/http/client-ip";

export async function POST(request: Request) {
  const key = getClientIp(request);
  if (await isSendVerificationBlocked(key)) {
    return NextResponse.json(
      { error: "Слишком много запросов. Попробуйте через минуту." },
      { status: 429 },
    );
  }

  await recordSendVerificationAttempt(key);

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

    const { emailSent } = await issueVerificationToken(user.userId, user.email);

    if (!emailSent) {
      console.error("send-verification email delivery failed");
      return NextResponse.json(
        { error: "Не удалось отправить письмо. Попробуйте позже." },
        { status: 503 },
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    console.error("send-verification failed");
    return NextResponse.json(
      { error: "Не удалось отправить письмо. Попробуйте позже." },
      { status: 500 },
    );
  }
}
