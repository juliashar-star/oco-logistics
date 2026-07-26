import type { PrismaClient } from "@prisma/client";
import type { CarrierCredentials } from "@oco/core/carrier-adapter/types";

import { decryptCarrierCredentials } from "../carrier-credentials";

export type ConnectedCarrier = {
  providerKey: string;
  credentials: CarrierCredentials;
};

/**
 * Provider keys of CarrierCredential rows for a company — no decrypt.
 * Badge / "already connected" checks only need the key, not the secret.
 */
export async function listConnectedProviderKeys(
  prisma: PrismaClient,
  companyId: string,
): Promise<string[]> {
  const rows = await prisma.carrierCredential.findMany({
    where: { companyId },
    select: { providerKey: true },
    orderBy: { providerKey: "asc" },
  });
  return rows.map((row) => row.providerKey);
}

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
