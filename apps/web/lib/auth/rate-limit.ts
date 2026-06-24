/** Простая защита от перебора паролей (в памяти, для MVP). */
const attempts = new Map<string, { count: number; resetAt: number }>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

const registerAttempts = new Map<string, { count: number; resetAt: number }>();

const REGISTER_MAX_ATTEMPTS = 5;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

export function isLoginBlocked(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

export function recordFailedLogin(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  entry.count += 1;
}

export function clearLoginAttempts(key: string): void {
  attempts.delete(key);
}

export function isRegisterBlocked(key: string): boolean {
  const entry = registerAttempts.get(key);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    registerAttempts.delete(key);
    return false;
  }
  return entry.count >= REGISTER_MAX_ATTEMPTS;
}

export function recordRegisterAttempt(key: string): void {
  const now = Date.now();
  const entry = registerAttempts.get(key);

  if (!entry || now > entry.resetAt) {
    registerAttempts.set(key, { count: 1, resetAt: now + REGISTER_WINDOW_MS });
    return;
  }

  entry.count += 1;
}

export function clearRegisterAttempts(key: string): void {
  registerAttempts.delete(key);
}

const publicRecommendAttempts = new Map<string, { count: number; resetAt: number }>();

const PUBLIC_RECOMMEND_MAX_ATTEMPTS = 5;
const PUBLIC_RECOMMEND_WINDOW_MS = 60 * 1000;

export function isPublicRecommendBlocked(key: string): boolean {
  const entry = publicRecommendAttempts.get(key);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    publicRecommendAttempts.delete(key);
    return false;
  }
  return entry.count >= PUBLIC_RECOMMEND_MAX_ATTEMPTS;
}

export function recordPublicRecommendAttempt(key: string): void {
  const now = Date.now();
  const entry = publicRecommendAttempts.get(key);

  if (!entry || now > entry.resetAt) {
    publicRecommendAttempts.set(key, { count: 1, resetAt: now + PUBLIC_RECOMMEND_WINDOW_MS });
    return;
  }

  entry.count += 1;
}
