import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { CabinetShell } from "@/components/cabinet-shell";
import { NewOrderForm } from "@/components/new-order-form";

export default async function NewOrderPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <CabinetShell active="/new-order">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">Новый заказ</h2>
        <p className="mt-2 text-slate-600">
          Укажите параметры посылки — система запросит тарифы у APIShip и покажет варианты.
        </p>
        <div className="mt-8">
          <NewOrderForm />
        </div>
      </div>
    </CabinetShell>
  );
}
