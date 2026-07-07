import { getApishipClientForCompany } from "@/lib/apiship-client-for-company";

export async function fetchConnectedCarriers(companyId: string): Promise<string[] | undefined> {
  try {
    const client = await getApishipClientForCompany(companyId);
    const connections = await client.listConnections();
    return connections.map((connection) => connection.providerKey);
  } catch {
    return undefined;
  }
}
