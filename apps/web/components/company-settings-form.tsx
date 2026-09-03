"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { normalizeRuPhone } from "@/lib/phone/ru-phone";
import type { OfferPriority } from "@/lib/shipments/preselect-offer";
import {
  OFFER_PRIORITY_CHEAPEST_RU,
  OFFER_PRIORITY_FASTEST_RU,
  OFFER_PRIORITY_HINT_RU,
  OFFER_PRIORITY_LEGEND_RU,
  OFFER_PRIORITY_NONE_RU,
} from "@/lib/shipments/preselect-notice";

export function CompanySettingsForm() {
  const [name, setName] = useState("");
  const [senderCity, setSenderCity] = useState("");
  const [senderAddress, setSenderAddress] = useState("");
  // Полная строка «г Москва, ул. Тверская, 1» для отображения в поле после выбора подсказки.
  // Не хранится в БД — только для UX. Сбрасывается при ручном вводе.
  const [addressDisplayValue, setAddressDisplayValue] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  // null IS a state, not «not loaded yet»: it is «Не выбирать — выберу сам»,
  // the NULL column, and the option the seller sees selected until they choose.
  const [offerPriority, setOfferPriority] = useState<OfferPriority | null>(null);
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
      setOfferPriority(
        data.defaultOfferPriority === "CHEAPEST" ||
          data.defaultOfferPriority === "FASTEST"
          ? data.defaultOfferPriority
          : null,
      );
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
          defaultOfferPriority: offerPriority,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Ошибка сохранения");
        return;
      }
      setSenderPhone(data.senderPhone ?? normalizedPhone);
      // FROM THE RESPONSE, never `true`. The route computes senderConfigured by
      // the order path's rule — city AND phone — so painting the green banner
      // on a successful save told a company that saved a city without a phone
      // that its address «подставляется в расчёт тарифов», and the calculation
      // then refused. A save succeeding and a sender being usable are two
      // different facts.
      setConfigured(Boolean(data.senderConfigured));
      setMessage("Настройки сохранены");
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
        <p className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
          Адрес отправителя указан — он подставляется в расчёт тарифов.
        </p>
      )}

      {/*
        CITY AND PHONE — the same rule the order path applies. The old text asked
        for «город и адрес склада», which is neither what the route checks nor
        what a quote needs: the address line is optional, the phone is not.
        «Неточным» was wrong too — without these the calculation is refused, not
        approximate.
      */}
      {!configured && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          Укажите город и телефон отправителя. Без них расчёт тарифов недоступен.
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
          Для создания отправлений. Формат: +7 и 10 цифр.
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

      {/* THREE STATES, and the first is the current behaviour. «Не выбирать —
          выберу сам» is the NULL column, not a third enum value — see
          parse-offer-priority. The strings live in preselect-notice so they
          are testable; a rule nothing can exercise is a rule nobody watches. */}
      <fieldset>
        <legend className="mb-1 block text-sm font-medium text-slate-700">
          {OFFER_PRIORITY_LEGEND_RU}
        </legend>
        <div className="space-y-2">
          {(
            [
              [null, OFFER_PRIORITY_NONE_RU],
              ["CHEAPEST", OFFER_PRIORITY_CHEAPEST_RU],
              ["FASTEST", OFFER_PRIORITY_FASTEST_RU],
            ] as const
          ).map(([value, label]) => (
            <label
              key={label}
              className="flex items-center gap-2 text-sm text-slate-700"
            >
              <input
                type="radio"
                name="default-offer-priority"
                checked={offerPriority === value}
                onChange={() => setOfferPriority(value)}
              />
              {label}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">{OFFER_PRIORITY_HINT_RU}</p>
      </fieldset>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}{" "}
          <button
            type="button"
            onClick={() => void loadCompanyProfile()}
            className="rounded-lg bg-primary px-2 py-0.5 text-white hover:bg-primary-hover"
          >
            Повторить
          </button>
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
        {/* ONE button for the whole card, and the label must say so: this now
            saves the sender city, address, phone AND the default priority in a
            single request. A button per field would let a seller change two
            things and save one. */}
        {loading ? "Сохранение..." : "Сохранить настройки"}
      </button>
    </form>
  );
}
