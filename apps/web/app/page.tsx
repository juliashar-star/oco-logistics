import Link from "next/link";
import { redirect } from "next/navigation";
import { APP_NAME } from "@oco/shared";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6">
      <main className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Логистика для D2C-брендов
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">{APP_NAME}</h1>
        <p className="mt-4 leading-relaxed text-slate-600">
          Сравнивайте доставку, создавайте отправления и копите статистику качества перевозчиков.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/register"
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-slate-800"
          >
            Создать аккаунт
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-center text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            Войти
          </Link>
        </div>
      </main>
    </div>
  );
}
