import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">
          ← OCO Logistics
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">Регистрация</h1>
        <p className="mt-2 text-sm text-slate-600">
          Создайте аккаунт компании, чтобы начать работу с кабинетом.
        </p>
        <div className="mt-6">
          <AuthForm mode="register" />
        </div>
      </div>
    </div>
  );
}
