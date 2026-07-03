import type { NextRequest } from "next/server";

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

const APP_ORIGIN_ERROR = "APP_ORIGIN must be set and be a valid URL origin";

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function resolveAllowedOrigin(): string {
  const configured = process.env.APP_ORIGIN?.trim();
  if (!configured) {
    throw new Error(APP_ORIGIN_ERROR);
  }

  const normalized = normalizeOrigin(configured);
  if (!normalized) {
    throw new Error(APP_ORIGIN_ERROR);
  }

  return normalized;
}

let cachedAllowedOrigin: string | undefined;

function getAllowedOrigin(): string {
  if (cachedAllowedOrigin === undefined) {
    cachedAllowedOrigin = resolveAllowedOrigin();
  }
  return cachedAllowedOrigin;
}

function getRequestOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  if (origin) {
    return normalizeOrigin(origin);
  }

  const referer = request.headers.get("referer");
  if (referer) {
    return normalizeOrigin(referer);
  }

  return null;
}

export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(method);
}

/** Fail closed: mutating requests must present Origin (or Referer origin) matching APP_ORIGIN. */
export function isAllowedRequestOrigin(request: NextRequest): boolean {
  const requestOrigin = getRequestOrigin(request);
  if (!requestOrigin) {
    return false;
  }

  return requestOrigin === getAllowedOrigin();
}
