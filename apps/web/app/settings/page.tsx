import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { CabinetShell } from "@/components/cabinet-shell";
import { ApishipSettingsForm } from "@/components/apiship-settings-form";
import { CompanySettingsForm } from "@/components/company-settings-form";
import { SettingsBackupPanel } from "@/components/settings-backup-panel";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <CabinetShell active="/settings">
      <div className="space-y-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900">Настройки</h2>
          <p className="mt-2 text-slate-600">
            Профиль компании и подключение APIShip для расчёта тарифов.
          </p>
          <div className="mt-8 max-w-md">
            <h3 className="font-medium text-slate-900">Адрес отправителя</h3>
            <p className="mt-1 text-sm text-slate-500">
              Используется при расчёте и создании отправлений по умолчанию.
            </p>
            <div className="mt-4">
              <CompanySettingsForm />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="max-w-md">
            <h3 className="font-medium text-slate-900">APIShip</h3>
            <p className="mt-1 text-sm text-slate-500">
              Логин и пароль для расчёта тарифов и создания отправлений.
            </p>
            <div className="mt-4">
              <ApishipSettingsForm />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="max-w-md">
            <h3 className="font-medium text-slate-900">Резервная копия</h3>
            <p className="mt-1 text-sm text-slate-500">
              Экспорт и восстановление всех настроек кабинета.
            </p>
            <div className="mt-4">
              <SettingsBackupPanel />
            </div>
          </div>
        </div>
      </div>
    </CabinetShell>
  );
}
