"use client";

import Link from "next/link";
import { useState } from "react";

type RankTag = "fast" | "cheap" | "optimal";

type Quote = {
  providerKey: string;
  tariffId: number;
  tariffName: string;
  deliveryCostRub: number;
  deliveryDaysMin: number;
  deliveryDaysMax: number;
  deliveryMode: "door" | "point";
  tags: RankTag[];
};

const TAG_LABELS: Record<RankTag, string> = {
  fast: "Быстро",
  cheap: "Дёшево",
  optimal: "Оптимально",
};

export function NewOrderForm() {
  const [weightG, setWeightG] = useState("1000");
  const [lengthCm, setLengthCm] = useState("30");
  const [widthCm, setWidthCm] = useState("20");
  const [heightCm, setHeightCm] = useState("10");
  const [destCity, setDestCity] = useState("Санкт-Петербург");
  const [pickupType, setPickupType] = useState<"PVZ" | "COURIER">("PVZ");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [meta, setMeta] = useState<{ fromCity?: string; destCity?: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCalculate(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    setQuotes([]);

    try {
      const response = await fetch("/api/shipments/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weightG: Number(weightG),
          lengthCm: Number(lengthCm),
          widthCm: Number(widthCm),
          heightCm: Number(heightCm),
          destCity,
          pickupType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Не удалось рассчитать тарифы");
        return;
      }

      setQuotes(data.quotes ?? []);
      setMeta({ fromCity: data.fromCity, destCity: data.destCity });

      if ((data.quotes ?? []).length === 0) {
        setError("APIShip не вернул вариантов для этих параметров");
      }
    } catch {
      setError("Не удалось связаться с сервером");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleCalculate} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Город назначения
            </label>
            <input
              required
              value={destCity}
              onChange={(e) => setDestCity(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Санкт-Петербург"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Тип доставки
            </label>
            <select
              value={pickupType}
              onChange={(e) => setPickupType(e.target.value as "PVZ" | "COURIER")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="PVZ">До пункта выдачи (ПВЗ)</option>
              <option value="COURIER">Курьер до двери</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Вес, г</label>
            <input
              required
              type="number"
              min={1}
              value={weightG}
              onChange={(e) => setWeightG(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Длина, см</label>
            <input
              required
              type="number"
              min={1}
              value={lengthCm}
              onChange={(e) => setLengthCm(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Ширина, см</label>
            <input
              required
              type="number"
              min={1}
              value={widthCm}
              onChange={(e) => setWidthCm(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Высота, см</label>
            <input
              required
              type="number"
              min={1}
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
            {error.includes("не подключён") && (
              <>
                {" "}
                <Link href="/settings" className="underline">
                  Перейти в настройки
                </Link>
              </>
            )}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? "Считаем тарифы..." : "Рассчитать тарифы"}
        </button>
      </form>

      {quotes.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Варианты доставки
            {meta && (
              <span className="ml-2 text-sm font-normal text-slate-500">
                {meta.fromCity} → {meta.destCity}
              </span>
            )}
          </h3>
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Служба</th>
                  <th className="px-4 py-3 font-medium">Тариф</th>
                  <th className="px-4 py-3 font-medium">Цена</th>
                  <th className="px-4 py-3 font-medium">Срок</th>
                  <th className="px-4 py-3 font-medium">Метки</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((quote) => (
                  <tr key={`${quote.providerKey}-${quote.tariffId}-${quote.deliveryMode}`} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium uppercase text-slate-900">
                      {quote.providerKey}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{quote.tariffName}</td>
                    <td className="px-4 py-3 text-slate-900">
                      {quote.deliveryCostRub.toLocaleString("ru-RU")} ₽
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {quote.deliveryDaysMin === quote.deliveryDaysMax
                        ? `${quote.deliveryDaysMin} дн.`
                        : `${quote.deliveryDaysMin}–${quote.deliveryDaysMax} дн.`}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {quote.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
                          >
                            {TAG_LABELS[tag]}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Создание отправления и сохранение в базу — на следующем шаге.
          </p>
        </div>
      )}
    </div>
  );
}
