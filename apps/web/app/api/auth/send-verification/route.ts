import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
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

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(request: Request) {
  const key = clientIp(request);
  if (isSendVerificationBlocked(key)) {
    return NextResponse.json(
      { error: "Слишком много запросов. Попробуйте через минуту." },
      { status: 429 },
    );
  }

  recordSendVerificationAttempt(key);

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        verificationTokenExpiry: true,
      },
    });

    if (!user || user.id !== session.userId) {
      return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
    }

    if (user.emailVerified) {
      return NextResponse.json({ error: "Email уже подтверждён" }, { status: 400 });
    }

    if (isResendCooldownActive(user.verificationTokenExpiry)) {
      const retryAfter = resendCooldownRemainingSec(user.verificationTokenExpiry);
      return NextResponse.json(
        { error: `Подождите ${retryAfter} сек. перед повторной отправкой` },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    const { emailSent } = await issueVerificationToken(user.id, user.email);

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
