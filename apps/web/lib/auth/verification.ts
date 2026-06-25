import { randomUUID } from "crypto";
import { sendVerificationEmail } from "@oco/core";
import { prisma } from "@/lib/db";

export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;

export function verificationTokenIssuedAt(expiry: Date): Date {
  return new Date(expiry.getTime() - VERIFICATION_TOKEN_TTL_MS);
}

export function isResendCooldownActive(expiry: Date | null | undefined): boolean {
  if (!expiry) return false;
  const issuedAt = verificationTokenIssuedAt(expiry);
  return Date.now() - issuedAt.getTime() < VERIFICATION_RESEND_COOLDOWN_MS;
}

export function resendCooldownRemainingSec(expiry: Date | null | undefined): number {
  if (!expiry) return 0;
  const issuedAt = verificationTokenIssuedAt(expiry);
  const remaining = VERIFICATION_RESEND_COOLDOWN_MS - (Date.now() - issuedAt.getTime());
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

export async function issueVerificationToken(
  userId: string,
  email: string,
): Promise<{ emailSent: boolean }> {
  const token = randomUUID();
  const verificationTokenExpiry = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

  await prisma.user.update({
    where: { id: userId },
    data: {
      verificationToken: token,
      verificationTokenExpiry,
    },
  });

  try {
    await sendVerificationEmail(email, token);
    return { emailSent: true };
  } catch {
    console.error("verification email send failed");
    return { emailSent: false };
  }
}
