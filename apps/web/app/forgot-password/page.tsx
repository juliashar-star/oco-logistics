import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-md rounded-[var(--r-lg)] border border-border bg-surface p-8 shadow-sm">
        <Link href="/login" className="text-sm text-text-3 hover:text-text-2">
          ← Ко входу
        </Link>

        <div className="mt-6 flex items-center gap-2.5">
          <div className="h-8 w-8 shrink-0 rounded-full bg-primary" aria-hidden />
          <span className="text-xl font-bold text-text">
            oco<span className="text-primary">.</span>
          </span>
        </div>

        <h1 className="mt-6 text-heading text-text">Сброс пароля</h1>
        <p className="mt-3 text-body text-text-2">
          Введите email вашего аккаунта — мы отправим ссылку для создания нового пароля.
        </p>

        <div className="mt-8">
          <ForgotPasswordForm />
        </div>
      </div>
    </div>
  );
}
