import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

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

async function isBlocked(bucket: string, key: string, maxAttempts: number): Promise<boolean> {
  const row = await prisma.rateLimitBucket.findUnique({
    where: { bucket_key: { bucket, key } },
  });
  if (!row) return false;
  if (row.resetAt < new Date()) return false;
  return row.count >= maxAttempts;
}

/** IDs for raw INSERT: crypto.randomUUID() — no pgcrypto dependency in migrations. */
async function recordAttempt(bucket: string, key: string, windowMs: number): Promise<void> {
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

async function clearAttempts(bucket: string, key: string): Promise<void> {
  await prisma.rateLimitBucket.deleteMany({ where: { bucket, key } });
}

export async function isLoginBlocked(key: string): Promise<boolean> {
  return isBlocked(BUCKET_LOGIN, key, MAX_ATTEMPTS);
}

export async function recordFailedLogin(key: string): Promise<void> {
  await recordAttempt(BUCKET_LOGIN, key, WINDOW_MS);
}

export async function clearLoginAttempts(key: string): Promise<void> {
  await clearAttempts(BUCKET_LOGIN, key);
}

export async function isRegisterBlocked(key: string): Promise<boolean> {
  return isBlocked(BUCKET_REGISTER, key, REGISTER_MAX_ATTEMPTS);
}

export async function recordRegisterAttempt(key: string): Promise<void> {
  await recordAttempt(BUCKET_REGISTER, key, REGISTER_WINDOW_MS);
}

export async function clearRegisterAttempts(key: string): Promise<void> {
  await clearAttempts(BUCKET_REGISTER, key);
}

export async function isPublicRecommendBlocked(key: string): Promise<boolean> {
  return isBlocked(BUCKET_PUBLIC_RECOMMEND, key, PUBLIC_RECOMMEND_MAX_ATTEMPTS);
}

export async function recordPublicRecommendAttempt(key: string): Promise<void> {
  await recordAttempt(BUCKET_PUBLIC_RECOMMEND, key, PUBLIC_RECOMMEND_WINDOW_MS);
}

export async function isSendVerificationBlocked(key: string): Promise<boolean> {
  return isBlocked(BUCKET_SEND_VERIFICATION, key, SEND_VERIFICATION_MAX_ATTEMPTS);
}

export async function recordSendVerificationAttempt(key: string): Promise<void> {
  await recordAttempt(BUCKET_SEND_VERIFICATION, key, SEND_VERIFICATION_WINDOW_MS);
}

export async function isForgotPasswordBlocked(key: string): Promise<boolean> {
  return isBlocked(BUCKET_FORGOT_PASSWORD, key, FORGOT_PASSWORD_MAX_ATTEMPTS);
}

export async function recordForgotPasswordAttempt(key: string): Promise<void> {
  await recordAttempt(BUCKET_FORGOT_PASSWORD, key, FORGOT_PASSWORD_WINDOW_MS);
}

export async function isResetPasswordBlocked(key: string): Promise<boolean> {
  return isBlocked(BUCKET_RESET_PASSWORD, key, RESET_PASSWORD_MAX_ATTEMPTS);
}

export async function recordResetPasswordAttempt(key: string): Promise<void> {
  await recordAttempt(BUCKET_RESET_PASSWORD, key, RESET_PASSWORD_WINDOW_MS);
}

export async function isCarrierConnectionRequestBlocked(key: string): Promise<boolean> {
  return isBlocked(
    BUCKET_CARRIER_CONNECTION_REQUEST,
    key,
    CARRIER_CONNECTION_REQUEST_MAX_ATTEMPTS,
  );
}

export async function recordCarrierConnectionRequestAttempt(key: string): Promise<void> {
  await recordAttempt(
    BUCKET_CARRIER_CONNECTION_REQUEST,
    key,
    CARRIER_CONNECTION_REQUEST_WINDOW_MS,
  );
}
