"use client";

import { useEffect, useState } from "react";

type SettingsState = {
  connected: boolean;
  login: string | null;
  isSandbox: boolean;
  canCalculate: boolean;
  envConfigured: boolean;
  encryptionConfigured: boolean;
};

export function ApishipSettingsForm() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<SettingsState | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetch("/api/settings/apiship")
      .then((r) => r.json())
      .then((data) => {
        setStatus(data);
        if (data.isSandbox && !data.connected) {
          setLogin("test");
        }
      })
      .catch(() => setError("Не удалось загрузить настройки"));
  }, []);

  async function handleTest() {
    setError("");
    setMessage("");

    if (!login.trim()) {
      setError("Укажите логин APIShip");
      return;
    }
    if (!password) {
      setError("Укажите пароль APIShip для проверки");
      return;
    }

    setTesting(true);
    try {
      const response = await fetch("/api/settings/apiship/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Ошибка проверки");
        return;
      }
      setMessage(data.message ?? "Подключение успешно");
    } catch {
      setError("Не удалось связаться с сервером");
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!login.trim()) {
      setError("Укажите логин APIShip");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/settings/apiship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password: password || undefined }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Ошибка сохранения");
        return;
      }
      setMessage("Настройки APIShip сохранены");
      setPassword("");
      const refreshed = await fetch("/api/settings/apiship").then((r) => r.json());
      setStatus(refreshed);
    } catch {
      setError("Не удалось сохранить настройки");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSave} noValidate autoComplete="off" className="space-y-4">
      {status?.isSandbox && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Тестовый контур APIShip. Для разработки можно использовать логин и пароль{" "}
          <strong>test</strong>.
        </p>
      )}

      {status?.connected && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          APIShip подключён{status.login ? ` (${status.login})` : ""}.
        </p>
      )}

      {!status?.encryptionConfigured && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Для сохранения пароля APIShip на сервере нужен ключ{" "}
          <code className="text-xs">APISHIP_ENCRYPTION_KEY</code> в файле{" "}
          <code className="text-xs">.env</code> (минимум 32 символа). После добавления перезапустите{" "}
          <code className="text-xs">npm run dev</code>.
        </p>
      )}

      {!status?.canCalculate && !status?.envConfigured && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          APIShip не настроен — расчёт тарифов недоступен.
        </p>
      )}

      <div>
        <label htmlFor="apiship-user" className="mb-1 block text-sm font-medium text-slate-700">
          Логин APIShip
        </label>
        <p className="mb-2 text-xs text-slate-500">
          Любая строка от APIShip, например <strong>test</strong> — не обязательно email.
        </p>
        <input
          id="apiship-user"
          type="text"
          name="apiship-user"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          inputMode="text"
          spellCheck={false}
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="test"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-500"
        />
      </div>

      <div>
        <label htmlFor="apiship-secret" className="mb-1 block text-sm font-medium text-slate-700">
          Пароль APIShip
        </label>
        <input
          id="apiship-secret"
          type="password"
          name="apiship-secret"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={status?.connected ? "Оставьте пустым, чтобы не менять" : "Пароль"}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-500"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {message && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
          {message}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || !login || !password}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-60"
        >
          {testing ? "Проверка..." : "Проверить подключение"}
        </button>
        <button
          type="submit"
          disabled={loading || !login}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? "Сохранение..." : "Сохранить"}
        </button>
      </div>

      <p className="text-xs text-slate-500">
        Логин и пароль хранятся только на сервере в зашифрованном виде и не передаются в браузер
        после сохранения.
      </p>
    </form>
  );
}
