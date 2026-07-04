import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { consumePasswordResetToken } from "@/lib/auth/password-reset";
import {
  isResetPasswordBlocked,
  recordResetPasswordAttempt,
} from "@/lib/auth/rate-limit";
import { validateResetPassword } from "@/lib/auth/validation";
import { logAuditEvent } from "@/lib/audit/log";
import { getClientIp } from "@/lib/http/client-ip";

const GENERIC_ERROR = "Ссылка недействительна или истекла. Запросите сброс пароля заново.";

export async function POST(request: Request) {
  const key = getClientIp(request);
  if (await isResetPasswordBlocked(key)) {
    return NextResponse.json(
      { error: "Слишком много попыток. Попробуйте через 15 минут." },
      { status: 429 },
    );
  }

  await recordResetPasswordAttempt(key);

  try {
    const body = await request.json();
    const token = String(body.token ?? "").trim();
    const password = String(body.password ?? "");

    const errors = validateResetPassword({ token, password });
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0].message, errors }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const result = await consumePasswordResetToken(token, passwordHash);

    if (!result.ok) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
    }

    void logAuditEvent({
      userId: result.userId,
      companyId: result.companyId,
      action: "auth.password_reset.consume",
      entityType: "user",
      entityId: result.userId,
    });

    return NextResponse.json({ success: true });
  } catch {
    console.error("reset-password failed");
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }
}
