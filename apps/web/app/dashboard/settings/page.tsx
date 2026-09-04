import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { CabinetShell } from "@/components/cabinet-shell";
import { UserSettingsTabs, type TabId } from "@/components/user-settings-tabs";
import { prisma } from "@/lib/db";
import { resolveCarrierAnchor } from "@/lib/carriers/resolve-carrier-anchor";

const TAB_IDS: TabId[] = ["profile", "company", "security", "connection"];

function resolveInitialTab(tab: string | undefined): TabId {
  if (tab && (TAB_IDS as string[]).includes(tab)) {
    return tab as TabId;
  }
  return "profile";
}

type UserSettingsPageProps = {
  searchParams: Promise<{ tab?: string; carrier?: string }>;
};

export default async function UserSettingsPage({ searchParams }: UserSettingsPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { tab, carrier } = await searchParams;

  const profile = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { name: true },
  });

  return (
    <CabinetShell active="/dashboard/settings">
      <UserSettingsTabs
        initialName={profile?.name ?? ""}
        initialTab={resolveInitialTab(tab)}
        // Validated HERE, beside the tab, and against the same kind of white
        // list — an unknown key becomes null and the tab opens exactly as it
        // does without the parameter. Nothing from the address bar reaches the
        // markup unchecked.
        initialCarrier={resolveCarrierAnchor(carrier)}
      />
    </CabinetShell>
  );
}
