"use client";

import { useCallback, useEffect, useState } from "react";

const COOLDOWN_SEC = 60;

type ResendVerificationButtonProps = {
  initialCooldownSec?: number;
  label?: string;
  className?: string;
};

export function ResendVerificationButton({
  initialCooldownSec = 0,
  label = "Отправить повторно",
  className = "",
}: ResendVerificationButtonProps) {
  const [cooldown, setCooldown] = useState(initialCooldownSec);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setCooldown(initialCooldownSec);
  }, [initialCooldownSec]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const handleResend = useCallback(async () => {
    if (cooldown > 0 || loading) return;
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/send-verification", { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          const match = String(data.error ?? "").match(/(\d+)/);
          setCooldown(match ? Number(match[1]) : COOLDOWN_SEC);
        }
        setError(data.error ?? "Не удалось отправить письмо");
        return;
      }

      setCooldown(COOLDOWN_SEC);
    } catch {
      setError("Не удалось связаться с сервером");
    } finally {
      setLoading(false);
    }
  }, [cooldown, loading]);

  const disabled = loading || cooldown > 0;

  return (
    <div>
      <button
        type="button"
        onClick={handleResend}
        disabled={disabled}
        className={
          className ||
          "rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        {loading
          ? "Отправляем..."
          : cooldown > 0
            ? `Повторить через ${cooldown} сек.`
            : label}
      </button>
      {error && (
        <p className="mt-2 text-sm text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
