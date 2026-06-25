import Link from "next/link";

export default function VerifyEmailErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-md rounded-[var(--r-lg)] border border-border bg-surface p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-error-soft">
          <span className="text-xl text-error" aria-hidden>
            !
          </span>
        </div>

        <h1 className="mt-6 text-heading text-text">Ссылка недействительна или истекла</h1>
        <p className="mt-3 text-body text-text-2">
          Запросите новую ссылку для подтверждения email.
        </p>

        <Link
          href="/verify-email"
          className="mt-8 inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover"
        >
          Запросить новую ссылку
        </Link>
      </div>
    </div>
  );
}
