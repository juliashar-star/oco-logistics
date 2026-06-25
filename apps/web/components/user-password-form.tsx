"use client";

import { useState } from "react";

export function UserPasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (newPassword !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/user/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Не удалось сменить пароль");
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Пароль успешно изменён");
    } catch {
      setError("Не удалось сменить пароль");
    } finally {
      setLoading(false);
    }
  }

  const inputClassName =
    "w-full rounded-lg border border-border px-3 py-2 text-text outline-none focus:border-primary focus:ring-1 focus:ring-primary";

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-md space-y-4">
      <div>
        <label htmlFor="current-password" className="mb-1 block text-sm font-medium text-text-2">
          Текущий пароль
        </label>
        <input
          id="current-password"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className={inputClassName}
        />
      </div>

      <div>
        <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-text-2">
          Новый пароль
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className={inputClassName}
          placeholder="Минимум 8 символов"
        />
      </div>

      <div>
        <label htmlFor="confirm-password" className="mb-1 block text-sm font-medium text-text-2">
          Подтвердите новый пароль
        </label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={inputClassName}
          placeholder="Повторите пароль"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-error-soft px-3 py-2 text-sm text-error" role="alert">
          {error}
        </p>
      )}

      {message && (
        <p className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success" role="status">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {loading ? "Сохранение..." : "Сохранить"}
      </button>
    </form>
  );
}
