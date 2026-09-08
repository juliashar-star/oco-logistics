import { NextResponse } from "next/server";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  clearPasswordChangeAttempts,
  isPasswordChangeBlocked,
  recordFailedPasswordChange,
} from "@/lib/auth/rate-limit";
import { withAuth } from "@/lib/auth/with-auth";
import { validateChangePassword } from "@/lib/auth/validation";
import { prisma } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit/log";

const WRONG_PASSWORD_ERROR = "Не удалось сменить пароль. Проверьте текущий пароль.";

export const PATCH = withAuth(async (request, user) => {
  // THE KEY IS THE USER, never the IP and never a pair of the two: a composite
  // key hands every fresh IP its own allowance, so rotating IPs walks straight
  // through it. The route is behind withAuth, so userId is always there.
  const key = user.userId;

  // FIRST, before the body is even parsed: a blocked caller must not reach
  // validation, the user lookup or the hash comparison.
  if (await isPasswordChangeBlocked(prisma, key)) {
    return NextResponse.json(
      {
        error:
          "Слишком много попыток сменить пароль. Подождите 15 минут и попробуйте снова.",
      },
      { status: 429 },
    );
  }

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
      await recordFailedPasswordChange(prisma, key);
      return NextResponse.json({ error: WRONG_PASSWORD_ERROR }, { status: 400 });
    }

    const valid = await verifyPassword(currentPassword, stored.passwordHash);
    if (!valid) {
      // ONLY FAILURES COUNT, and the counter is cleared on success — the
      // login/register model, not the five routes that record every request.
      // Changing a password successfully several times in a row is not abuse.
      await recordFailedPasswordChange(prisma, key);
      return NextResponse.json({ error: WRONG_PASSWORD_ERROR }, { status: 400 });
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.userId },
      data: { passwordHash },
    });

    await clearPasswordChangeAttempts(prisma, key);

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
