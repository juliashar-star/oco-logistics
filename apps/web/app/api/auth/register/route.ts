import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { validateRegistration } from "@/lib/auth/validation";

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

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
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
