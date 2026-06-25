"use client";

import Link from "next/link";
import { useState } from "react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Что-то пошло не так");
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Не удалось связаться с сервером. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft">
          <span className="text-xl text-primary" aria-hidden>
            ✓
          </span>
        </div>
        <p className="mt-6 text-body text-text-2">
          Если этот email зарегистрирован, вы получите письмо со ссылкой для сброса пароля.
        </p>
        <Link
          href="/login"
          className="mt-8 inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover"
        >
          Вернуться ко входу
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-text-2">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          placeholder="you@brand.ru"
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
        {loading ? "Отправляем..." : "Отправить ссылку"}
      </button>

      <p className="text-center text-sm text-text-3">
        <Link href="/login" className="font-medium text-text underline-offset-2 hover:underline">
          ← Вернуться ко входу
        </Link>
      </p>
    </form>
  );
}
