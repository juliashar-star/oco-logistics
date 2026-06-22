import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { validateRegistration } from "@/lib/auth/validation";
import {
  clearRegisterAttempts,
  isRegisterBlocked,
  recordRegisterAttempt,
} from "@/lib/auth/rate-limit";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(body.password ?? "");
    const companyName = String(body.companyName ?? "").trim();

    const errors = validateRegistration({ email, password, companyName });
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0].message, errors }, { status: 400 });
    }

    const key = clientIp(request);
    if (isRegisterBlocked(key)) {
      return NextResponse.json(
        {
          error: "Слишком много попыток регистрации. Попробуйте через час.",
        },
        { status: 429 },
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      recordRegisterAttempt(key);
      return NextResponse.json(
        { error: "Аккаунт с таким email уже существует" },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(password);

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyName,
          contactEmail: email,
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          companyId: company.id,
          role: "OWNER",
        },
      });

      return { company, user };
    });

    await createSession({
      userId: result.user.id,
      companyId: result.company.id,
      email: result.user.email,
      role: result.user.role,
    });

    clearRegisterAttempts(key);

    return NextResponse.json({
      ok: true,
      redirect: "/dashboard",
    });
  } catch {
    console.error("register failed");
    return NextResponse.json(
      { error: "Не удалось создать аккаунт. Попробуйте позже." },
      { status: 500 },
    );
  }
}
