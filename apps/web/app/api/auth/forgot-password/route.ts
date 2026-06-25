import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  isForgotPasswordBlocked,
  recordForgotPasswordAttempt,
} from "@/lib/auth/rate-limit";
import { issuePasswordResetToken } from "@/lib/auth/password-reset";
import { validateForgotPassword } from "@/lib/auth/validation";

const SUCCESS_MESSAGE =
  "Если этот email зарегистрирован, вы получите письмо со ссылкой для сброса пароля.";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(request: Request) {
  const key = clientIp(request);
  if (isForgotPasswordBlocked(key)) {
    return NextResponse.json(
      { error: "Слишком много запросов. Попробуйте через 15 минут." },
      { status: 429 },
    );
  }

  recordForgotPasswordAttempt(key);

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
      select: { id: true, email: true },
    });

    if (user) {
      await issuePasswordResetToken(user.id, user.email);
    }

    return NextResponse.json({ success: true, message: SUCCESS_MESSAGE });
  } catch {
    console.error("forgot-password failed");
    return NextResponse.json({ success: true, message: SUCCESS_MESSAGE });
  }
}
