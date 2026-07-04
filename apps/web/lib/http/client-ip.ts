/** First hop from X-Forwarded-For; trusts header as set by reverse proxy (see ROADMAP). */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? "unknown";
}
