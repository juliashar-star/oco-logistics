"use client";

import { ResendVerificationButton } from "@/components/resend-verification-button";

export function VerificationBanner() {
  return (
    <div
      className="sticky top-0 z-50 border-b border-warning/30 bg-warning-soft px-6 py-3"
      role="status"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-text">
          Подтвердите email, чтобы создавать отправления
        </p>
        <ResendVerificationButton
          label="Отправить повторно"
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
    </div>
  );
}
