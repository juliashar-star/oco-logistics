import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { CabinetShell } from "@/components/cabinet-shell";
import { CarrierPickerDashboardForm } from "@/components/carrier-picker-dashboard-form";

export default async function CarrierPickerDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <CabinetShell active="/dashboard/carrier-picker">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">Подбор перевозчика</h2>
        <p className="mt-2 text-slate-600">
          Укажите категорию товара и параметры посылки — покажем подходящих перевозчиков из
          подключённых в APIShip.
        </p>

        <CarrierPickerDashboardForm />
      </div>
    </CabinetShell>
  );
}
