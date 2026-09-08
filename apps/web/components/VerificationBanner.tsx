"use client";

import { ResendVerificationButton } from "@/components/resend-verification-button";

/**
 * The seconds left on the resend cooldown, from the server, exactly as
 * `/verify-email` gets them. Without this the banner's button was live on every
 * cabinet page the instant it loaded, however recently the letter had gone out:
 * the seller pressed it, the server refused with 429, and the countdown only
 * then appeared. The state was always known — it was simply never passed down.
 */
export function VerificationBanner({
  initialCooldownSec = 0,
}: {
  initialCooldownSec?: number;
}) {
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
          initialCooldownSec={initialCooldownSec}
          label="Отправить повторно"
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
    </div>
  );
}
