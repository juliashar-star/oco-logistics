import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  isForgotPasswordBlocked,
  recordForgotPasswordAttempt,
} from "@/lib/auth/rate-limit";
import { issuePasswordResetToken } from "@/lib/auth/password-reset";
import { validateForgotPassword } from "@/lib/auth/validation";
import { logAuditEvent } from "@/lib/audit/log";
import { getClientIp } from "@/lib/http/client-ip";

const SUCCESS_MESSAGE =
  "Если этот email зарегистрирован, вы получите письмо со ссылкой для сброса пароля.";

export async function POST(request: Request) {
  const key = getClientIp(request);
  if (await isForgotPasswordBlocked(key)) {
    return NextResponse.json(
      { error: "Слишком много запросов. Попробуйте через 15 минут." },
      { status: 429 },
    );
  }

  await recordForgotPasswordAttempt(key);

  try {
    const body = await request.json();
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();

    const errors = validateForgotPassword({ email });
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0].message, errors }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, companyId: true },
    });

    if (user) {
      await issuePasswordResetToken(user.id, user.email);
      void logAuditEvent({
        userId: user.id,
        companyId: user.companyId,
        action: "auth.password_reset.request",
        entityType: "user",
        entityId: user.id,
      });
    }

    return NextResponse.json({ success: true, message: SUCCESS_MESSAGE });
  } catch (error) {
    console.error("forgot-password failed", error);
    return NextResponse.json({ success: true, message: SUCCESS_MESSAGE });
  }
}
