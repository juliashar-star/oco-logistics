import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readSessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import { isAllowedRequestOrigin, isMutatingMethod } from "@/lib/security/csrf";
import { nextPageWithCsp } from "@/lib/security/csp";

const PROTECTED_PREFIXES = ["/dashboard", "/settings", "/new-order", "/shipments"];

const AUTH_PAGES = ["/login", "/register"];

const PASSWORD_FLOW_PAGES = ["/forgot-password", "/reset-password"];

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isProtectedPath(pathname: string): boolean {
  if (pathname === "/verify-email") return true;
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- API branch: CSRF Origin check only; no CSP on JSON responses. ---
  if (isApiPath(pathname)) {
    if (isMutatingMethod(request.method) && !isAllowedRequestOrigin(request)) {
      return NextResponse.json({ error: "csrf_origin_mismatch" }, { status: 403 });
    }
    return NextResponse.next();
  }

  // --- Page branch: session redirects (unchanged scope) + per-request CSP nonce. ---
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await readSessionToken(token);

  const isProtected = isProtectedPath(pathname);
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if (PASSWORD_FLOW_PAGES.includes(pathname)) {
    return nextPageWithCsp(request);
  }

  if (isProtected && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return nextPageWithCsp(request);
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon\\.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
