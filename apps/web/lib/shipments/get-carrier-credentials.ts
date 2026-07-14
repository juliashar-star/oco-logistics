import type { PrismaClient } from "@prisma/client";
import type { CarrierCredentials } from "@oco/core/carrier-adapter/types";

import { decryptCarrierCredentials } from "../carrier-credentials";

export type CarrierCredentialsResult =
  | { ok: true; credentials: CarrierCredentials }
  | { ok: false; reason: "not_connected" };

/**
 * Load & decrypt CarrierCredential for (companyId, providerKey).
 *
 * Boundary:
 * - Absent row → { ok:false, reason:"not_connected" } (user: carrier not set up).
 * - Decrypt failure (missing/short CARRIER_CREDENTIALS_ENCRYPTION_KEY, bad
 *   ciphertext) → thrown (server incident → 500). Do not map to not_connected.
 *
 * Provider-specific key checks (e.g. platformStationId/token) belong in the
 * adapter (assertYandexCredentials), not here.
 */
export async function getCarrierCredentials(
  prisma: PrismaClient,
  companyId: string,
  providerKey: string,
): Promise<CarrierCredentialsResult> {
  const row = await prisma.carrierCredential.findUnique({
    where: { companyId_providerKey: { companyId, providerKey } },
  });

  if (!row) {
    return { ok: false, reason: "not_connected" };
  }

  const credentials = decryptCarrierCredentials(row.credentialsEnc);
  return { ok: true, credentials };
}
