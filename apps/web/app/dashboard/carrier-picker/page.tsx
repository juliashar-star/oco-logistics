import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { CabinetShell } from "@/components/cabinet-shell";
import { CarrierPickerDashboardForm } from "@/components/carrier-picker-dashboard-form";

export default async function CarrierPickerDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <CabinetShell active="/dashboard/carrier-picker">
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900">Подбор перевозчика</h2>
          {/*
            The old copy promised «из подключённых в вашем кабинете» and the
            page does something else: it ranks the WHOLE registry and marks
            which entries this company has connected (rank.ts sets isConnected
            per carrier and filters nothing). Saying so out loud matters here —
            this page is the way out for a seller who has no carrier contract
            yet, and a promise that it only shows connections would send them
            away from the one screen that works without one.
          */}
          <p className="mt-2 text-slate-600">
            Укажите категорию товара и параметры посылки — покажем подходящих
            перевозчиков и отметим, кто из них уже подключён в вашем кабинете.
            Подбор работает и без подключений: сравнить условия можно до договора с
            перевозчиком.
          </p>

          <CarrierPickerDashboardForm />
        </div>
      </div>
    </CabinetShell>
  );
}
