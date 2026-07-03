import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readSessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import { isAllowedRequestOrigin, isMutatingMethod } from "@/lib/security/csrf";

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

  // --- API branch: CSRF Origin check only; session page redirects never run here. ---
  if (isApiPath(pathname)) {
    if (isMutatingMethod(request.method) && !isAllowedRequestOrigin(request)) {
      return NextResponse.json({ error: "csrf_origin_mismatch" }, { status: 403 });
    }
    return NextResponse.next();
  }

  // --- Page branch: unchanged session redirect scope (protected + auth pages only). ---
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await readSessionToken(token);

  const isProtected = isProtectedPath(pathname);
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if (PASSWORD_FLOW_PAGES.includes(pathname)) {
    return NextResponse.next();
  }

  if (isProtected && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/:path*",
    "/dashboard/:path*",
    "/settings/:path*",
    "/new-order/:path*",
    "/shipments/:path*",
    "/verify-email",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
  ],
};
