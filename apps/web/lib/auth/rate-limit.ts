import { randomUUID } from "node:crypto";
// The client is a PARAMETER, and the `@/` alias is deliberately absent. Both for
// the same reason: this module must be reachable by a db test running outside
// Next, where the alias does not resolve and where the `@oco/db` singleton would
// bind to the DEVELOPER's database. Same reason as the services in `lib/shipments`
// and `lib/carriers`, which have taken their client this way from the start.
import type { PrismaClient } from "@prisma/client";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

const REGISTER_MAX_ATTEMPTS = 5;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

const PUBLIC_RECOMMEND_MAX_ATTEMPTS = 5;
const PUBLIC_RECOMMEND_WINDOW_MS = 60 * 1000;

const SEND_VERIFICATION_MAX_ATTEMPTS = 5;
const SEND_VERIFICATION_WINDOW_MS = 60 * 1000;

const FORGOT_PASSWORD_MAX_ATTEMPTS = 3;
const FORGOT_PASSWORD_WINDOW_MS = 15 * 60 * 1000;

const RESET_PASSWORD_MAX_ATTEMPTS = 5;
const RESET_PASSWORD_WINDOW_MS = 15 * 60 * 1000;

const BUCKET_LOGIN = "login";
const BUCKET_REGISTER = "register";
const BUCKET_PUBLIC_RECOMMEND = "public-recommend";
const BUCKET_SEND_VERIFICATION = "send-verification";
const BUCKET_FORGOT_PASSWORD = "forgot-password";
const BUCKET_RESET_PASSWORD = "reset-password";

const CARRIER_CONNECTION_REQUEST_MAX_ATTEMPTS = 20;
const CARRIER_CONNECTION_REQUEST_WINDOW_MS = 60 * 60 * 1000;
const BUCKET_CARRIER_CONNECTION_REQUEST = "carrier-connection-request";

/**
 * Five failed password changes in a row is an anomaly, not a person who
 * mistyped: someone who has forgotten their current password has «забыли
 * пароль» and does not need a sixth guess here.
 */
const PASSWORD_CHANGE_MAX_ATTEMPTS = 5;
const PASSWORD_CHANGE_WINDOW_MS = 15 * 60 * 1000;
const BUCKET_PASSWORD_CHANGE = "password-change";

/**
 * Ten is deliberately loose: mail clients open a link more than once — preview
 * panes, link scanners, a second tap — and a limit tuned for a human clicking
 * would lock a legitimate seller out of their own verification.
 */
const VERIFY_EMAIL_MAX_ATTEMPTS = 10;
const VERIFY_EMAIL_WINDOW_MS = 15 * 60 * 1000;
const BUCKET_VERIFY_EMAIL = "verify-email";

async function isBlocked(
  prisma: PrismaClient,
  bucket: string,
  key: string,
  maxAttempts: number,
): Promise<boolean> {
  const row = await prisma.rateLimitBucket.findUnique({
    where: { bucket_key: { bucket, key } },
  });
  if (!row) return false;
  if (row.resetAt < new Date()) return false;
  return row.count >= maxAttempts;
}

/** IDs for raw INSERT: crypto.randomUUID() — no pgcrypto dependency in migrations. */
async function recordAttempt(
  prisma: PrismaClient,
  bucket: string,
  key: string,
  windowMs: number,
): Promise<void> {
  const newResetAt = new Date(Date.now() + windowMs);
  const id = randomUUID();

  await prisma.$executeRaw`
    INSERT INTO "RateLimitBucket" (id, bucket, key, count, "resetAt")
    VALUES (${id}, ${bucket}, ${key}, 1, ${newResetAt})
    ON CONFLICT (bucket, key) DO UPDATE SET
      count = CASE
        WHEN "RateLimitBucket"."resetAt" < now() THEN 1
        ELSE "RateLimitBucket".count + 1
      END,
      "resetAt" = CASE
        WHEN "RateLimitBucket"."resetAt" < now() THEN ${newResetAt}
        ELSE "RateLimitBucket"."resetAt"
      END
  `;
}

async function clearAttempts(
  prisma: PrismaClient,
  bucket: string,
  key: string,
): Promise<void> {
  await prisma.rateLimitBucket.deleteMany({ where: { bucket, key } });
}

export async function isLoginBlocked(
  prisma: PrismaClient,
  key: string,
): Promise<boolean> {
  return isBlocked(prisma, BUCKET_LOGIN, key, MAX_ATTEMPTS);
}

export async function recordFailedLogin(
  prisma: PrismaClient,
  key: string,
): Promise<void> {
  await recordAttempt(prisma, BUCKET_LOGIN, key, WINDOW_MS);
}

export async function clearLoginAttempts(
  prisma: PrismaClient,
  key: string,
): Promise<void> {
  await clearAttempts(prisma, BUCKET_LOGIN, key);
}

export async function isRegisterBlocked(
  prisma: PrismaClient,
  key: string,
): Promise<boolean> {
  return isBlocked(prisma, BUCKET_REGISTER, key, REGISTER_MAX_ATTEMPTS);
}

export async function recordRegisterAttempt(
  prisma: PrismaClient,
  key: string,
): Promise<void> {
  await recordAttempt(prisma, BUCKET_REGISTER, key, REGISTER_WINDOW_MS);
}

export async function clearRegisterAttempts(
  prisma: PrismaClient,
  key: string,
): Promise<void> {
  await clearAttempts(prisma, BUCKET_REGISTER, key);
}

export async function isPublicRecommendBlocked(
  prisma: PrismaClient,
  key: string,
): Promise<boolean> {
  return isBlocked(prisma, BUCKET_PUBLIC_RECOMMEND, key, PUBLIC_RECOMMEND_MAX_ATTEMPTS);
}

export async function recordPublicRecommendAttempt(
  prisma: PrismaClient,
  key: string,
): Promise<void> {
  await recordAttempt(prisma, BUCKET_PUBLIC_RECOMMEND, key, PUBLIC_RECOMMEND_WINDOW_MS);
}

export async function isSendVerificationBlocked(
  prisma: PrismaClient,
  key: string,
): Promise<boolean> {
  return isBlocked(prisma, BUCKET_SEND_VERIFICATION, key, SEND_VERIFICATION_MAX_ATTEMPTS);
}

export async function recordSendVerificationAttempt(
  prisma: PrismaClient,
  key: string,
): Promise<void> {
  await recordAttempt(prisma, BUCKET_SEND_VERIFICATION, key, SEND_VERIFICATION_WINDOW_MS);
}

export async function isForgotPasswordBlocked(
  prisma: PrismaClient,
  key: string,
): Promise<boolean> {
  return isBlocked(prisma, BUCKET_FORGOT_PASSWORD, key, FORGOT_PASSWORD_MAX_ATTEMPTS);
}

export async function recordForgotPasswordAttempt(
  prisma: PrismaClient,
  key: string,
): Promise<void> {
  await recordAttempt(prisma, BUCKET_FORGOT_PASSWORD, key, FORGOT_PASSWORD_WINDOW_MS);
}

export async function isResetPasswordBlocked(
  prisma: PrismaClient,
  key: string,
): Promise<boolean> {
  return isBlocked(prisma, BUCKET_RESET_PASSWORD, key, RESET_PASSWORD_MAX_ATTEMPTS);
}

export async function recordResetPasswordAttempt(
  prisma: PrismaClient,
  key: string,
): Promise<void> {
  await recordAttempt(prisma, BUCKET_RESET_PASSWORD, key, RESET_PASSWORD_WINDOW_MS);
}

export async function isCarrierConnectionRequestBlocked(
  prisma: PrismaClient,
  key: string,
): Promise<boolean> {
  return isBlocked(
    prisma,
    BUCKET_CARRIER_CONNECTION_REQUEST,
    key,
    CARRIER_CONNECTION_REQUEST_MAX_ATTEMPTS,
  );
}

export async function recordCarrierConnectionRequestAttempt(
  prisma: PrismaClient,
  key: string,
): Promise<void> {
  await recordAttempt(
    prisma,
    BUCKET_CARRIER_CONNECTION_REQUEST,
    key,
    CARRIER_CONNECTION_REQUEST_WINDOW_MS,
  );
}

export async function isPasswordChangeBlocked(
  prisma: PrismaClient,
  key: string,
): Promise<boolean> {
  return isBlocked(prisma, BUCKET_PASSWORD_CHANGE, key, PASSWORD_CHANGE_MAX_ATTEMPTS);
}

export async function recordFailedPasswordChange(
  prisma: PrismaClient,
  key: string,
): Promise<void> {
  await recordAttempt(prisma, BUCKET_PASSWORD_CHANGE, key, PASSWORD_CHANGE_WINDOW_MS);
}

export async function clearPasswordChangeAttempts(
  prisma: PrismaClient,
  key: string,
): Promise<void> {
  await clearAttempts(prisma, BUCKET_PASSWORD_CHANGE, key);
}

export async function isVerifyEmailBlocked(
  prisma: PrismaClient,
  key: string,
): Promise<boolean> {
  return isBlocked(prisma, BUCKET_VERIFY_EMAIL, key, VERIFY_EMAIL_MAX_ATTEMPTS);
}

export async function recordVerifyEmailAttempt(
  prisma: PrismaClient,
  key: string,
): Promise<void> {
  await recordAttempt(prisma, BUCKET_VERIFY_EMAIL, key, VERIFY_EMAIL_WINDOW_MS);
}
