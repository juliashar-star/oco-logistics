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

type CspDirectiveParts = {
  defaultSrc: string[];
  scriptSrc: string[];
  styleSrc: string[];
  imgSrc: string[];
  fontSrc: string[];
  connectSrc: string[];
  objectSrc: string[];
  baseUri: string[];
  formAction: string[];
  frameAncestors: string[];
};

/** Shared strict base — both global and /new-order policies start from this. */
function buildBaseDirectiveParts(nonce: string): CspDirectiveParts {
  const isDev = isDevelopmentCsp();

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    // Dev only: React/Next Fast Refresh uses eval for stack traces and HMR.
    ...(isDev ? ["'unsafe-eval'"] : []),
  ];

  // Dev only: Fast Refresh and dev overlays inject <style> tags without a nonce.
  const styleSrc = isDev
    ? ["'self'", "'unsafe-inline'"]
    : ["'self'", `'nonce-${nonce}'`];

  return {
    defaultSrc: ["'self'"],
    scriptSrc,
    styleSrc,
    imgSrc: ["'self'", "data:", "blob:"],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
  };
}

function serializeContentSecurityPolicy(parts: CspDirectiveParts): string {
  return [
    `default-src ${parts.defaultSrc.join(" ")}`,
    `script-src ${parts.scriptSrc.join(" ")}`,
    `style-src ${parts.styleSrc.join(" ")}`,
    `img-src ${parts.imgSrc.join(" ")}`,
    `font-src ${parts.fontSrc.join(" ")}`,
    `connect-src ${parts.connectSrc.join(" ")}`,
    `object-src ${parts.objectSrc.join(" ")}`,
    `base-uri ${parts.baseUri.join(" ")}`,
    `form-action ${parts.formAction.join(" ")}`,
    `frame-ancestors ${parts.frameAncestors.join(" ")}`,
  ].join("; ");
}

/** Per-request CSP for HTML document responses. API routes must not call this. */
export function buildContentSecurityPolicy(nonce: string): string {
  return serializeContentSecurityPolicy(buildBaseDirectiveParts(nonce));
}

/**
 * /new-order only — strict base + Yandex PVZ widget hosts.
 * Trackers (mc.yandex.ru, log.api-maps.yandex.ru) deliberately excluded.
 */
export function buildOrderPageContentSecurityPolicy(nonce: string): string {
  const parts = buildBaseDirectiveParts(nonce);
  parts.connectSrc.push(
    "https://widget-pvz.dostavka.yandex.net",
    "https://api-maps.yandex.ru",
  );
  parts.imgSrc.push(
    "https://core-renderer-tiles.maps.yandex.net",
    "https://api-maps.yandex.ru",
    "https://yastatic.net",
  );
  parts.styleSrc.push("https://yastatic.net");
  parts.fontSrc.push("https://yastatic.net");
  return serializeContentSecurityPolicy(parts);
}

function nextPageWithPolicy(
  request: NextRequest,
  buildPolicy: (nonce: string) => string,
): NextResponse {
  const nonce = generateNonce();
  const csp = buildPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export function nextPageWithCsp(request: NextRequest): NextResponse {
  return nextPageWithPolicy(request, buildContentSecurityPolicy);
}

export function nextOrderPageWithCsp(request: NextRequest): NextResponse {
  return nextPageWithPolicy(request, buildOrderPageContentSecurityPolicy);
}
