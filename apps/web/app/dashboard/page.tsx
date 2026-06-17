import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { CabinetShell } from "@/components/cabinet-shell";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <CabinetShell active="/dashboard">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Добро пожаловать
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">
          Кабинет готов к работе
        </h2>
        <p className="mt-3 text-slate-600">
          Вы вошли как <span className="font-medium text-slate-900">{user.email}</span>.
        </p>

        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
          <h3 className="font-medium text-slate-900">С чего начать</h3>
          <ol className="mt-4 space-y-3 text-sm text-slate-600">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-medium text-white">
                1
              </span>
              <Link href="/settings" className="text-slate-900 underline-offset-2 hover:underline">
                Подключите APIShip в настройках
              </Link>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-medium text-white">
                2
              </span>
              Укажите адрес отправителя (скоро — US-2.2)
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-medium text-white">
                3
              </span>
              <Link href="/new-order" className="text-slate-900 underline-offset-2 hover:underline">
                Рассчитайте первое отправление
              </Link>
            </li>
          </ol>
        </div>
      </div>
    </CabinetShell>
  );
}
