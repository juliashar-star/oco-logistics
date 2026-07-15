import type { PrismaClient } from "@prisma/client";
import type { CarrierCredentials } from "@oco/core/carrier-adapter/types";

import { decryptCarrierCredentials } from "../carrier-credentials";

export type ConnectedCarrier = {
  providerKey: string;
  credentials: CarrierCredentials;
};

/**
 * List every CarrierCredential row for a company, decrypted.
 *
 * Boundary (same as getCarrierCredentials):
 * - No rows → [] (user: company has connected nothing).
 * - Decrypt failure → thrown (server incident). Not swallowed per row —
 *   dropping a connected carrier would report it as absent.
 *
 * One findMany ordered by providerKey — deterministic for downstream merge;
 * no N+1 via getCarrierCredentials. Bag contents are not validated here.
 */
export async function listConnectedCarriers(
  prisma: PrismaClient,
  companyId: string,
): Promise<ConnectedCarrier[]> {
  const rows = await prisma.carrierCredential.findMany({
    where: { companyId },
    orderBy: { providerKey: "asc" },
  });

  return rows.map((row) => ({
    providerKey: row.providerKey,
    credentials: decryptCarrierCredentials(row.credentialsEnc),
  }));
}
