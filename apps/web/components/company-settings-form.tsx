"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { normalizeRuPhone } from "@/lib/phone/ru-phone";

export function CompanySettingsForm() {
  const [name, setName] = useState("");
  const [senderCity, setSenderCity] = useState("");
  const [senderAddress, setSenderAddress] = useState("");
  // Полная строка «г Москва, ул. Тверская, 1» для отображения в поле после выбора подсказки.
  // Не хранится в БД — только для UX. Сбрасывается при ручном вводе.
  const [addressDisplayValue, setAddressDisplayValue] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [configured, setConfigured] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void loadCompanyProfile();
  }, []);

  async function loadCompanyProfile() {
    setError("");
    try {
      const response = await fetch("/api/settings/company");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Не удалось загрузить профиль. Обновите страницу.",
        );
        return;
      }
      setName(data.name ?? "");
      setSenderCity(data.senderCity ?? "");
      setSenderAddress(data.senderAddress ?? "");
      setSenderPhone(data.senderPhone ?? "");
      setConfigured(Boolean(data.senderConfigured));
    } catch {
      setError("Не удалось загрузить профиль компании");
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setPhoneError("");

    if (!senderCity.trim()) {
      setError("Укажите город отправления");
      return;
    }

    let normalizedPhone = "";
    if (senderPhone.trim()) {
      const result = normalizeRuPhone(senderPhone);
      if (!result.ok) {
        setPhoneError(result.error);
        return;
      }
      normalizedPhone = result.value;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/settings/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderCity: senderCity.trim(),
          senderAddress: senderAddress.trim(),
          senderPhone: normalizedPhone,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Ошибка сохранения");
        return;
      }
      setSenderPhone(data.senderPhone ?? normalizedPhone);
      setConfigured(true);
      setMessage("Адрес отправителя сохранён");
    } catch {
      setError("Не удалось сохранить профиль");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSave} noValidate className="space-y-4">
      {name && (
        <p className="text-sm text-slate-600">
          Компания: <span className="font-medium text-slate-900">{name}</span>
        </p>
      )}

      {configured && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          Адрес отправителя указан — он подставляется в расчёт тарифов.
        </p>
      )}

      {!configured && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Укажите город и адрес склада или офиса, откуда вы отгружаете посылки. Без этого расчёт
          тарифов будет неточным.
        </p>
      )}

      <div>
        <label htmlFor="sender-city" className="mb-1 block text-sm font-medium text-slate-700">
          Город отправления
        </label>
        <Input
          id="sender-city"
          required
          value={senderCity}
          onChange={(e) => setSenderCity(e.target.value)}
          placeholder="Москва"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Адрес отправления
        </label>
        <p className="mb-2 text-xs text-slate-500">
          Начните вводить улицу — выберите подсказку, и город заполнится автоматически.
          Или впишите адрес вручную.
        </p>
        <AddressAutocomplete
          value={senderAddress}
          displayValue={addressDisplayValue || undefined}
          onChange={(raw) => {
            setSenderAddress(raw);
            setAddressDisplayValue("");
          }}
          onSelect={(result) => {
            if (result.city) setSenderCity(result.city);
            setSenderAddress(result.addressString);
            setAddressDisplayValue(result.fullAddress);
          }}
          placeholder="Начните вводить улицу или полный адрес"
          disabled={loading}
        />
      </div>

      <div>
        <label htmlFor="sender-phone" className="mb-1 block text-sm font-medium text-slate-700">
          Телефон отправителя
        </label>
        <p className="mb-2 text-xs text-slate-500">
          Для создания отправлений в APIShip. Формат: +7 и 10 цифр.
        </p>
        <Input
          id="sender-phone"
          type="tel"
          autoComplete="tel"
          value={senderPhone}
          onChange={(e) => {
            setSenderPhone(e.target.value);
            if (phoneError) {
              setPhoneError("");
            }
          }}
          placeholder="+7 (999) 123-45-67"
          aria-invalid={Boolean(phoneError)}
        />
        {phoneError && (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {phoneError}
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}{" "}
          <button
            type="button"
            onClick={() => void loadCompanyProfile()}
            className="underline"
          >
            Повторить
          </button>
        </p>
      )}

      {message && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {loading ? "Сохранение..." : "Сохранить адрес отправителя"}
      </button>
    </form>
  );
}
