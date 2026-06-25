import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">
          ← OCO Logistics
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">Вход в кабинет OCO</h1>
        <p className="mt-2 text-sm text-text-3">
          Email и пароль, которые вы указали при регистрации компании.{" "}
          <strong>Это не логин APIShip</strong> (тот настраивается отдельно в «Настройках» после входа).
        </p>
        <div className="mt-6">
          <Suspense fallback={<p className="text-sm text-slate-500">Загрузка...</p>}>
            <AuthForm mode="login" />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
