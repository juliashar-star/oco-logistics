import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { CabinetShell } from "@/components/cabinet-shell";
import { UserSettingsTabs } from "@/components/user-settings-tabs";
import { prisma } from "@/lib/db";

export default async function UserSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { name: true, warehouseAddress: true },
  });

  return (
    <CabinetShell active="/dashboard/settings">
      <UserSettingsTabs
        initialName={profile?.name ?? ""}
        initialWarehouseAddress={profile?.warehouseAddress ?? ""}
      />
    </CabinetShell>
  );
}
