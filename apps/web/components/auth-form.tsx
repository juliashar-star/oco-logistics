"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

type AuthFormProps = {
  mode: "login" | "register";
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint =
        mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const body =
        mode === "register"
          ? { email, password, companyName }
          : { email, password };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Что-то пошло не так");
        return;
      }

      router.push(data.redirect ?? searchParams.get("next") ?? "/dashboard");
      router.refresh();
    } catch {
      setError("Не удалось связаться с сервером. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {mode === "register" && (
        <div>
          <label htmlFor="companyName" className="mb-1 block text-sm font-medium text-slate-700">
            Название компании
          </label>
          <input
            id="companyName"
            type="text"
            autoComplete="organization"
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
            placeholder="Например, Brand Co"
          />
        </div>
      )}

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
          placeholder="you@brand.ru"
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Пароль
          </label>
          {mode === "login" && (
            <Link
              href="/forgot-password"
              className="text-sm text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
            >
              Забыли пароль?
            </Link>
          )}
        </div>
        <input
          id="password"
          type="password"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          required
          minLength={mode === "register" ? 8 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
          placeholder={mode === "register" ? "Минимум 8 символов" : "Ваш пароль"}
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
      >
        {loading
          ? "Подождите..."
          : mode === "register"
            ? "Создать аккаунт"
            : "Войти"}
      </button>

      <p className="text-center text-sm text-slate-600">
        {mode === "register" ? (
          <>
            Уже есть аккаунт?{" "}
            <Link href="/login" className="font-medium text-slate-900 underline-offset-2 hover:underline">
              Войти
            </Link>
          </>
        ) : (
          <>
            Нет аккаунта?{" "}
            <Link href="/register" className="font-medium text-slate-900 underline-offset-2 hover:underline">
              Зарегистрироваться
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
