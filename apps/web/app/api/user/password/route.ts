import { NextResponse } from "next/server";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { withAuth } from "@/lib/auth/with-auth";
import { validateChangePassword } from "@/lib/auth/validation";
import { prisma } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit/log";

const WRONG_PASSWORD_ERROR = "Не удалось сменить пароль. Проверьте текущий пароль.";

export const PATCH = withAuth(async (request, user) => {
  try {
    const body = await request.json();
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");

    const errors = validateChangePassword({ currentPassword, newPassword });
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0].message, errors }, { status: 400 });
    }

    const stored = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { passwordHash: true },
    });

    if (!stored) {
      return NextResponse.json({ error: WRONG_PASSWORD_ERROR }, { status: 400 });
    }

    const valid = await verifyPassword(currentPassword, stored.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: WRONG_PASSWORD_ERROR }, { status: 400 });
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.userId },
      data: { passwordHash },
    });

    void logAuditEvent({
      userId: user.userId,
      companyId: user.companyId,
      action: "user.password.change",
      entityType: "user",
      entityId: user.userId,
    });

    return NextResponse.json({ success: true });
  } catch {
    console.error("user password change failed");
    return NextResponse.json(
      { error: "Не удалось сменить пароль" },
      { status: 500 },
    );
  }
});
