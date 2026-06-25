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
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <a
            href="https://a.apiship.ru/#/providers/list"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover"
          >
            Подключить перевозчиков в APIShip
          </a>

          <div className="mt-4 text-[13px] leading-relaxed text-text-2">
            <p className="font-medium text-text">Как подключить перевозчика</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Войдите в кабинет APIShip по кнопке выше</li>
              <li>В меню слева откройте раздел «Службы доставки»</li>
              <li>Выберите перевозчика и заполните поля подключения</li>
            </ol>
            <p className="mt-3">
              Подключить можно перевозчиков, с которыми у вас есть действующий договор. После
              подключения в APIShip перевозчик автоматически появится в OCO.
            </p>
            <p className="mt-2">
              Подробная инструкция APIShip —{" "}
              <a
                href="https://docs.apiship.ru/docs/delivery-services/connection-delivery-sevices/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary-hover"
              >
                открыть
              </a>
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900">Подбор перевозчика</h2>
          <p className="mt-2 text-slate-600">
            Укажите категорию товара и параметры посылки — покажем подходящих перевозчиков из
            подключённых в APIShip.
          </p>

          <CarrierPickerDashboardForm />
        </div>
      </div>
    </CabinetShell>
  );
}
