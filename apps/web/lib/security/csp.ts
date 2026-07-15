import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function generateNonce(): string {
  return btoa(crypto.randomUUID());
}

function isLocalAppOrigin(): boolean {
  const configured = process.env.APP_ORIGIN?.trim();
  if (!configured) {
    return true;
  }
  try {
    const hostname = new URL(configured).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

/**
 * Dev-only CSP relaxations (unsafe-eval / style unsafe-inline).
 * Middleware is webpack-bundled at build time: `process.env.NODE_ENV` is constant-folded
 * from the BUILD environment, not read at runtime on the server. Use CSP_DEV_RELAXATIONS
 * (runtime) instead of NODE_ENV for the dev/prod split.
 *
 * Second gate: even if CSP_DEV_RELAXATIONS=1 is copy-pasted into a prod .env, relaxations
 * apply only when APP_ORIGIN points at localhost (structural local-dev signal).
 */
function isDevelopmentCsp(): boolean {
  if (process.env.CSP_DEV_RELAXATIONS !== "1") {
    return false;
  }
  return isLocalAppOrigin();
}

/** Per-request CSP for HTML document responses. API routes must not call this. */
export function buildContentSecurityPolicy(nonce: string): string {
  const isDev = isDevelopmentCsp();

  const scriptSrc = [
    "script-src 'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    // Dev only: React/Next Fast Refresh uses eval for stack traces and HMR.
    ...(isDev ? ["'unsafe-eval'"] : []),
  ].join(" ");

  // Dev only: Fast Refresh and dev overlays inject <style> tags without a nonce.
  const styleSrc = isDev
    ? "style-src 'self' 'unsafe-inline'"
    : `style-src 'self' 'nonce-${nonce}'`;

  return [
    "default-src 'self'",
    scriptSrc,
    styleSrc,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function nextPageWithCsp(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}
