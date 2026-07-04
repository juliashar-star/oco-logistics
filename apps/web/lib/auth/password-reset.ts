import { createHash, randomBytes } from "crypto";
import { sendPasswordResetEmail } from "@oco/core";
import { prisma } from "@/lib/db";

export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issuePasswordResetToken(
  userId: string,
  email: string,
): Promise<{ emailSent: boolean }> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashPasswordResetToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

  await prisma.passwordResetToken.create({
    data: {
      tokenHash,
      userId,
      expiresAt,
    },
  });

  try {
    await sendPasswordResetEmail(email, token);
    return { emailSent: true };
  } catch {
    console.error("password reset email send failed");
    return { emailSent: false };
  }
}

export type ConsumePasswordResetTokenResult =
  | { ok: true; userId: string; companyId: string }
  | { ok: false };

export async function consumePasswordResetToken(
  rawToken: string,
  newPasswordHash: string,
): Promise<ConsumePasswordResetTokenResult> {
  const tokenHash = hashPasswordResetToken(rawToken);
  const now = new Date();

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { companyId: true } },
    },
  });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < now) {
    return { ok: false };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash: newPasswordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: now },
    }),
    prisma.passwordResetToken.deleteMany({
      where: {
        userId: resetToken.userId,
        id: { not: resetToken.id },
      },
    }),
  ]);

  return {
    ok: true,
    userId: resetToken.userId,
    companyId: resetToken.user.companyId,
  };
}
