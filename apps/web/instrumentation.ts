import {
  CARRIER_BASE_URL_ENVS,
  CARRIER_CONTOUR_ENV,
  checkCarrierContourStartup,
} from "@oco/core/carrier-adapter/carrier-contour";

/**
 * Next.js instrumentation hook — `register()` runs ONCE when a server instance
 * boots (`next dev` / `next start`), never during `next build` and never in the
 * unit runner (nothing imports this file). This is the one place the carrier
 * contour is enforced: it is a property of the deployment, so it is checked at
 * startup, not on every carrier call.
 *
 * The decision itself lives in checkCarrierContourStartup (pure, unit-tested).
 * This hook only reads process.env and throws — env reads stay INSIDE register()
 * so nothing runs at bundle time; the throw fires only at real server boot.
 */
export async function register(): Promise<void> {
  // Node server runtime only — the edge runtime has neither these env vars nor
  // a reason to run this check.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const baseUrls: Record<string, string | undefined> = {};
  for (const envName of CARRIER_BASE_URL_ENVS) {
    baseUrls[envName] = process.env[envName];
  }

  const result = checkCarrierContourStartup(
    process.env[CARRIER_CONTOUR_ENV],
    baseUrls,
  );
  if (!result.ok) {
    throw new Error(result.message);
  }
}
