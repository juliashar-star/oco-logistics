import Link from "next/link";
import { ResetPasswordForm } from "@/components/reset-password-form";

type ResetPasswordPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { token } = await searchParams;
  const trimmedToken = token?.trim() ?? "";

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

        {!trimmedToken ? (
          <div className="mt-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-error-soft">
              <span className="text-xl text-error" aria-hidden>
                !
              </span>
            </div>
            <h1 className="mt-6 text-heading text-text">Ссылка недействительна</h1>
            <p className="mt-3 text-body text-text-2">
              Запросите новую ссылку для сброса пароля.
            </p>
            <Link
              href="/forgot-password"
              className="mt-8 inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover"
            >
              Запросить ссылку
            </Link>
          </div>
        ) : (
          <>
            <h1 className="mt-6 text-heading text-text">Новый пароль</h1>
            <p className="mt-3 text-body text-text-2">Придумайте новый пароль для вашего аккаунта.</p>
            <div className="mt-8">
              <ResetPasswordForm token={trimmedToken} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
