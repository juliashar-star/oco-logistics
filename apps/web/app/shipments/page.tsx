import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { CabinetShell } from "@/components/cabinet-shell";
import { ShipmentsPage } from "@/components/shipments-page";

export default async function ShipmentsRoutePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <CabinetShell active="/shipments">
      <ShipmentsPage />
    </CabinetShell>
  );
}
