import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { consumePasswordResetToken } from "@/lib/auth/password-reset";
import { validateResetPassword } from "@/lib/auth/validation";

const GENERIC_ERROR = "Ссылка недействительна или истекла. Запросите сброс пароля заново.";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = String(body.token ?? "").trim();
    const password = String(body.password ?? "");

    const errors = validateResetPassword({ token, password });
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0].message, errors }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const ok = await consumePasswordResetToken(token, passwordHash);

    if (!ok) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch {
    console.error("reset-password failed");
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }
}
