"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

type UserProfileFormProps = {
  initialName: string;
};

export function UserProfileForm({ initialName }: UserProfileFormProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Ошибка сохранения");
        return;
      }

      setName(data.user?.name ?? name);
      setMessage("Профиль сохранён");
    } catch {
      setError("Не удалось сохранить профиль");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-md space-y-4">
      <div>
        <label htmlFor="user-name" className="mb-1 block text-sm font-medium text-slate-700">
          Имя
        </label>
        <Input
          id="user-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Как к вам обращаться"
          maxLength={100}
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
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
