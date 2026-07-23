"use client";

import { useRef, useState } from "react";

export function SettingsBackupPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  async function handleDownload() {
    setError("");
    setMessage("");
    setDownloading(true);

    try {
      const response = await fetch("/api/settings/backup");
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Не удалось создать резервную копию");
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "oco-settings-backup.json";

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);

      setMessage("Резервная копия скачана. Храните файл в надёжном месте (например, менеджер паролей).");
    } catch {
      setError("Не удалось скачать резервную копию");
    } finally {
      setDownloading(false);
    }
  }

  async function handleRestore(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    setMessage("");

    if (!file.name.endsWith(".json")) {
      setError("Выберите файл резервной копии в формате JSON");
      return;
    }

    setRestoring(true);
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        setError("Файл не является корректным JSON");
        return;
      }

      const response = await fetch("/api/settings/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "Не удалось восстановить настройки");
        return;
      }

      const parts: string[] = ["Настройки восстановлены"];
      if (typeof data.companyName === "string") {
        parts.push(`из копии компании «${data.companyName}»`);
      }
      setMessage(parts.join(" ") + ". Обновите страницу, если поля не обновились.");
      window.location.reload();
    } catch {
      setError("Не удалось восстановить настройки из файла");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Сохраните адрес отправителя и данные компании в файл — при сбое или переустановке
        можно быстро восстановить настройки одним кликом.
      </p>

      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Файл содержит данные компании и адрес отправителя. Не публикуйте его.
      </p>

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
          onClick={() => void handleDownload()}
          disabled={downloading || restoring}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-60"
        >
          {downloading ? "Готовим файл..." : "Скачать резервную копию"}
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={downloading || restoring}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-60"
        >
          {restoring ? "Восстанавливаем..." : "Восстановить из файла"}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => void handleRestore(event)}
        />
      </div>
    </div>
  );
}
