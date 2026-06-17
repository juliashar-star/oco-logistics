import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { validateLogin } from "@/lib/auth/validation";
import {
  clearLoginAttempts,
  isLoginBlocked,
  recordFailedLogin,
} from "@/lib/auth/rate-limit";

function clientKey(request: Request, email: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "unknown";
  return `${ip}:${email}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(body.password ?? "");

    const errors = validateLogin({ email, password });
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0].message, errors }, { status: 400 });
    }

    const key = clientKey(request, email);
    if (isLoginBlocked(key)) {
      return NextResponse.json(
        {
          error:
            "Слишком много попыток входа. Подождите 15 минут и попробуйте снова.",
        },
        { status: 429 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { company: { select: { id: true } } },
    });

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      recordFailedLogin(key);
      return NextResponse.json(
        { error: "Неверный email или пароль" },
        { status: 401 },
      );
    }

    clearLoginAttempts(key);

    await createSession({
      userId: user.id,
      companyId: user.companyId,
      email: user.email,
      role: user.role,
    });

    return NextResponse.json({
      ok: true,
      redirect: "/dashboard",
    });
  } catch {
    console.error("login failed");
    return NextResponse.json(
      { error: "Не удалось войти. Попробуйте позже." },
      { status: 500 },
    );
  }
}
