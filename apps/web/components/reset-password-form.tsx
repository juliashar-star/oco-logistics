"use client";

import Link from "next/link";
import { useState } from "react";

type ResetPasswordFormProps = {
  token: string;
};

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Ссылка недействительна или истекла");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Не удалось связаться с сервером. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft">
          <span className="text-xl text-primary" aria-hidden>
            ✓
          </span>
        </div>
        <h2 className="mt-6 text-heading text-text">Пароль обновлён</h2>
        <p className="mt-3 text-body text-text-2">Теперь вы можете войти с новым паролем.</p>
        <Link
          href="/login"
          className="mt-8 inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover"
        >
          Войти
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-text-2">
          Новый пароль
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          placeholder="Минимум 8 символов"
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-text-2">
          Подтвердите пароль
        </label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          placeholder="Повторите пароль"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-error-soft px-3 py-2 text-sm text-error" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
      >
        {loading ? "Сохраняем..." : "Сохранить пароль"}
      </button>

      <p className="text-center text-sm text-text-3">
        <Link
          href="/forgot-password"
          className="font-medium text-text underline-offset-2 hover:underline"
        >
          Запросить новую ссылку
        </Link>
      </p>
    </form>
  );
}
