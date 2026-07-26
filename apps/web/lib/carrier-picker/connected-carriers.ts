import { prisma } from "@/lib/db";
import { listConnectedProviderKeys } from "@/lib/shipments/list-connected-carriers";

export async function fetchConnectedCarriers(companyId: string): Promise<string[]> {
  return listConnectedProviderKeys(prisma, companyId);
}
