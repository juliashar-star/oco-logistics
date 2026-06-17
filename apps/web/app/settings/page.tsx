import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { CabinetShell } from "@/components/cabinet-shell";
import { ApishipSettingsForm } from "@/components/apiship-settings-form";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <CabinetShell active="/settings">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">Настройки</h2>
        <p className="mt-2 text-slate-600">
          Подключение APIShip для расчёта тарифов и создания отправлений.
        </p>
        <div className="mt-8 max-w-md">
          <h3 className="font-medium text-slate-900">APIShip</h3>
          <div className="mt-4">
            <ApishipSettingsForm />
          </div>
        </div>
      </div>
    </CabinetShell>
  );
}
