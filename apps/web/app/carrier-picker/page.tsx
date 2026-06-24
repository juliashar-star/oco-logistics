"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { CATEGORY_TO_PROFILE } from "@oco/core";
import { Input } from "@/components/ui/input";

type RecommendCarrier = {
  providerKey: string;
  displayName: string;
  reasons: string[];
};

type RecommendResponse = {
  carriers: RecommendCarrier[];
  profile: string | null;
  ambiguous: boolean;
};

const CATEGORIES = CATEGORY_TO_PROFILE.map((item) => item.category);

export default function CarrierPickerPage() {
  const [category, setCategory] = useState("");
  const [weight, setWeight] = useState("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RecommendResponse | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);

    const weightNum = Number(weight);
    if (!category) {
      setError("Выберите категорию товара");
      return;
    }
    if (!Number.isFinite(weightNum) || weightNum < 0.1) {
      setError("Вес посылки должен быть не меньше 0,1 кг");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/carrier-picker/public-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          parcel: { weight: weightNum, value: 0 },
        }),
      });

      const data = (await response.json()) as RecommendResponse & { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Не удалось подобрать перевозчиков");
        return;
      }

      setResult(data);
    } catch {
      setError("Не удалось подобрать перевозчиков. Попробуйте позже.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">
          ← OCO Logistics
        </Link>

        <h1 className="mt-4 text-2xl font-semibold text-slate-900">
          Подберите перевозчика для вашего товара
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Инструмент для малого e-commerce — бесплатно
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="category" className="mb-1 block text-sm font-medium text-slate-700">
              Категория товара
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="">Выберите категорию</option>
              {CATEGORIES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="weight" className="mb-1 block text-sm font-medium text-slate-700">
              Вес посылки, кг
            </label>
            <Input
              id="weight"
              type="number"
              min={0.1}
              step={0.1}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Подбираем…" : "Подобрать"}
          </button>
        </form>

        {result && (
          <div className="mt-8 space-y-4">
            {result.ambiguous && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Категория подходит под несколько профилей доставки — показываем лучший вариант
              </p>
            )}

            {result.carriers.length === 0 ? (
              <p className="text-sm text-slate-600">Подходящих перевозчиков не найдено.</p>
            ) : (
              <ul className="space-y-3">
                {result.carriers.map((carrier) => (
                  <li
                    key={carrier.providerKey}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <p className="font-medium text-slate-900">{carrier.displayName}</p>
                    {carrier.reasons.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {carrier.reasons.map((reason) => (
                          <li key={reason} className="text-sm text-slate-600">
                            {reason}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
