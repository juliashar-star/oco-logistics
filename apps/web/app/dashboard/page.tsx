import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { CabinetShell } from "@/components/cabinet-shell";
import { DashboardStats } from "@/components/dashboard-stats";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <CabinetShell active="/dashboard">
      <DashboardStats
        userEmail={user.email}
        companyName={user.companyName}
        emailVerified={user.emailVerified}
      />
    </CabinetShell>
  );
}
