/**
 * Carrier contour guard — a PURE function, no process.env, no throws.
 *
 * Contour (sandbox vs production) is a property of the DEPLOYMENT, not of a
 * credential. It is validated ONCE at process startup (see apps/web
 * instrumentation register()), never on the per-call base-URL path — a per-call
 * check would fire inside the carrier unit suite, which injects fake hosts, and
 * refuse them. Keeping this pure and side-effect-free is what lets the startup
 * hook use it without the unit suite ever touching it.
 */

export const CARRIER_CONTOUR_ENV = "OCO_CARRIER_CONTOUR";

/** The only two accepted contour values. */
export const CARRIER_CONTOURS = ["sandbox", "production"] as const;
export type CarrierContour = (typeof CARRIER_CONTOURS)[number];

/**
 * Known carrier SANDBOX hostnames, taken verbatim from infra/.env.example:
 *   CDEK_BASE_URL            sandbox → https://api.edu.cdek.ru
 *   YANDEX_DELIVERY_BASE_URL sandbox → https://b2b.taxi.tst.yandex.net
 *   YANDEX_EXPRESS_BASE_URL  sandbox → https://b2b.taxi.tst.yandex.net
 * Production hosts are deliberately NOT enumerated — the guard only knows what
 * a sandbox looks like, and treats everything else as production.
 */
export const KNOWN_SANDBOX_HOSTS: ReadonlySet<string> = new Set([
  "api.edu.cdek.ru",
  "b2b.taxi.tst.yandex.net",
]);

export type ContourHostCheck = { ok: true } | { ok: false; reason: string };

function isCarrierContour(value: string | undefined): value is CarrierContour {
  return value === "sandbox" || value === "production";
}

/**
 * Decide whether `url` is allowed under `contour`.
 * - contour unset/unrecognised → refuse, naming the variable and both values.
 * - contour=sandbox and host is NOT a known sandbox → refuse.
 * - contour=production and host IS a known sandbox → refuse.
 * - otherwise allow.
 * The reason names the contour and the host; the caller adds the offending
 * base-URL variable name (this function is deliberately blind to it).
 */
export function checkContourHost(
  contour: string | undefined,
  url: string,
): ContourHostCheck {
  if (!isCarrierContour(contour)) {
    const shown =
      contour === undefined || contour === "" ? "unset" : `"${contour}"`;
    return {
      ok: false,
      reason: `${CARRIER_CONTOUR_ENV} must be "sandbox" or "production" (currently ${shown})`,
    };
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return { ok: false, reason: `base URL is not a valid URL: "${url}"` };
  }

  const isSandboxHost = KNOWN_SANDBOX_HOSTS.has(host);
  if (contour === "sandbox" && !isSandboxHost) {
    return {
      ok: false,
      reason: `contour "sandbox" but host ${host} is not a known carrier sandbox`,
    };
  }
  if (contour === "production" && isSandboxHost) {
    return {
      ok: false,
      reason: `contour "production" but host ${host} is a carrier sandbox`,
    };
  }
  return { ok: true };
}

/**
 * The carrier base-URL variables validated at startup, in evaluation order.
 * Lives here (not in the startup hook) so the decision is reachable from tests —
 * dropping one silently would make its refusal test fail, not pass unnoticed.
 */
export const CARRIER_BASE_URL_ENVS = [
  "CDEK_BASE_URL",
  "YANDEX_DELIVERY_BASE_URL",
  "YANDEX_EXPRESS_BASE_URL",
] as const;

export type CarrierContourStartupResult =
  | { ok: true }
  | { ok: false; envName: string; message: string };

/**
 * Whole-deployment contour decision — PURE (no process.env, no throw), so the
 * startup hook shrinks to "build the record, call this, throw the message".
 *
 * `baseUrls` maps each variable name to its raw value (or undefined). Order and
 * skip-when-unset match the original hook: contour validity is judged first,
 * before any host; then each base URL in CARRIER_BASE_URL_ENVS order, with an
 * unset/blank value skipped rather than refused. `message` is the complete
 * refusal text the hook throws verbatim — kept here so a test can pin its bytes.
 */
export function checkCarrierContourStartup(
  contour: string | undefined,
  baseUrls: Readonly<Record<string, string | undefined>>,
): CarrierContourStartupResult {
  if (!isCarrierContour(contour)) {
    const shown =
      contour === undefined || contour === "" ? "unset" : `"${contour}"`;
    return {
      ok: false,
      envName: CARRIER_CONTOUR_ENV,
      message:
        `Refusing to start: ${CARRIER_CONTOUR_ENV} must be one of ` +
        `${CARRIER_CONTOURS.map((value) => `"${value}"`).join(", ")} ` +
        `(currently ${shown}).`,
    };
  }

  for (const envName of CARRIER_BASE_URL_ENVS) {
    const raw = baseUrls[envName]?.trim();
    if (!raw) {
      continue;
    }
    const url = raw.replace(/\/$/, "");
    const verdict = checkContourHost(contour, url);
    if (!verdict.ok) {
      return {
        ok: false,
        envName,
        message: `Refusing to start: ${envName} — ${verdict.reason}.`,
      };
    }
  }

  return { ok: true };
}
