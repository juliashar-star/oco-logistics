import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { validateRegistration } from "@/lib/auth/validation";
import { issueVerificationToken } from "@/lib/auth/verification";
import {
  clearRegisterAttempts,
  isRegisterBlocked,
  recordRegisterAttempt,
} from "@/lib/auth/rate-limit";
import { getClientIp } from "@/lib/http/client-ip";

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

    const key = getClientIp(request);
    if (await isRegisterBlocked(prisma, key)) {
      return NextResponse.json(
        {
          error: "Слишком много попыток регистрации. Попробуйте через час.",
        },
        { status: 429 },
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await recordRegisterAttempt(prisma, key);
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

    const issued = await issueVerificationToken(result.user.id, result.user.email);
    if (issued.outcome === "failed") {
      // Nothing to tell the seller from here: when the first letter was proven
      // not sent its token was rolled back to null, and /verify-email reads
      // that and says «Письмо не отправлено» on its own. The reason is the
      // operator's.
      console.error(issued.serverLog);
    }

    await clearRegisterAttempts(prisma, key);

    return NextResponse.json({
      ok: true,
      redirect: "/verify-email",
    });
  } catch (error) {
    console.error("register failed", error);
    return NextResponse.json(
      { error: "Не удалось создать аккаунт. Попробуйте позже." },
      { status: 500 },
    );
  }
}
