"use client";

import { FormEvent, useState } from "react";
import { CATEGORY_TO_PROFILE, type RankedCarrier } from "@oco/core";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

const PROFILE_NULL_REASONS: Record<string, string> = {
  weight_required: "Укажите вес",
  no_active_carrier: "Подходящих активных перевозчиков для этой категории пока нет.",
};

const P5_P6_CATEGORIES = CATEGORY_TO_PROFILE.filter((item) =>
  item.profiles.some((profile) => profile === "P5" || profile === "P6"),
).map((item) => item.category);

type RecommendResponse = {
  profile: string | null;
  carriers?: RankedCarrier[];
  reason?: string;
  error?: string;
};

function formatConnectionEstimates(carrier: RankedCarrier): string | null {
  const parts: string[] = [];
  if (carrier.ocoConnectionEstimate) {
    parts.push(`подключение к OCO — ${carrier.ocoConnectionEstimate}`);
  }
  if (carrier.carrierContractEstimate?.value) {
    parts.push(`договор с перевозчиком — ${carrier.carrierContractEstimate.value}`);
  }
  if (parts.length === 0) return null;
  return `Ориентировочно: ${parts.join(" · ")}`;
}

function categoryNeedsWeight(category: string): boolean {
  return P5_P6_CATEGORIES.includes(category);
}

function profileNullMessage(data: RecommendResponse, weightProvided: boolean): string {
  if (data.reason && PROFILE_NULL_REASONS[data.reason]) {
    return PROFILE_NULL_REASONS[data.reason];
  }
  if (!weightProvided) return PROFILE_NULL_REASONS.weight_required;
  return PROFILE_NULL_REASONS.no_active_carrier;
}

export function CarrierPickerDashboardForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const [weightProvided, setWeightProvided] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);

    const form = event.currentTarget;
    const category = form.category.value.trim();
    const weightRaw = form.weight.value.trim();
    const maxSideRaw = form.maxSideCm.value.trim();

    if (!category) {
      setError("Выберите категорию товара");
      return;
    }

    const hasWeight = weightRaw !== "";
    setWeightProvided(hasWeight);
    const weightNum = hasWeight ? Number(weightRaw) : undefined;
    const maxSideNum = maxSideRaw !== "" ? Number(maxSideRaw) : undefined;

    if (hasWeight && (!Number.isFinite(weightNum) || weightNum! <= 0)) {
      setError("Вес должен быть больше 0");
      return;
    }

    if (maxSideRaw !== "" && (!Number.isFinite(maxSideNum) || maxSideNum! <= 0)) {
      setError("Длинная сторона должна быть больше 0");
      return;
    }

    if (categoryNeedsWeight(category) && !hasWeight) {
      setResult({ profile: null, carriers: [], reason: "weight_required" });
      return;
    }

    const parcel: { value: number; weight?: number; maxSideCm?: number } = { value: 0 };
    if (weightNum !== undefined) parcel.weight = weightNum;
    if (maxSideNum !== undefined) parcel.maxSideCm = maxSideNum;

    setLoading(true);
    try {
      const response = await fetch("/api/carrier-picker/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, parcel }),
      });

      const data = (await response.json()) as RecommendResponse;

      if (!response.ok) {
        setError(data.error || "Не удалось подобрать перевозчиков");
        return;
      }

      setResult(data);
    } catch {
      setError("Что-то пошло не так. Обновите страницу или попробуйте через минуту.");
    } finally {
      setLoading(false);
    }
  }

  const carriers = result?.carriers ?? [];

  return (
    <>
      <form id="carrier-picker-form" className="mt-8 max-w-lg space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="category" className="mb-1 block text-sm font-medium text-slate-700">
            Категория товара
          </label>
          <select
            id="category"
            name="category"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
            defaultValue=""
          >
            <option value="">Выберите категорию</option>
            {CATEGORY_TO_PROFILE.map((item) => (
              <option key={item.category} value={item.category}>
                {item.category}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="weight" className="mb-1 block text-sm font-medium text-slate-700">
            Вес, кг
          </label>
          <input
            id="weight"
            name="weight"
            type="number"
            min={0.1}
            step={0.1}
            placeholder="Необязательно"
            className="flex h-10 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-3 focus:border-primary focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="maxSideCm" className="mb-1 block text-sm font-medium text-slate-700">
            Длинная сторона, см
          </label>
          <input
            id="maxSideCm"
            name="maxSideCm"
            type="number"
            min={1}
            step={1}
            placeholder="Необязательно"
            className="flex h-10 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-3 focus:border-primary focus:outline-none"
          />
        </div>

        {error && (
          <p
            id="carrier-picker-error"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        )}

        <button
          id="carrier-picker-submit"
          type="submit"
          disabled={loading}
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Подбираем…" : "Подобрать перевозчика"}
        </button>
      </form>

      {result && (
        <div id="carrier-picker-result" className="mt-8 max-w-lg">
          {result.profile === null ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {profileNullMessage(result, weightProvided)}
            </p>
          ) : carriers.length === 0 ? (
            <EmptyState
              illustration="carrier"
              title="Перевозчиков не нашлось"
              description="Попробуйте другую категорию или уточните вес — покажем доступные варианты."
            />
          ) : (
            <ol className="space-y-3">
              {carriers.map((carrier, index) => {
                const estimateText = !carrier.isConnected
                  ? formatConnectionEstimates(carrier)
                  : null;

                return (
                  <li
                    key={carrier.providerKey}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-medium text-white">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-slate-900">{carrier.displayName}</p>
                          <Badge
                            className={
                              carrier.isConnected
                                ? "bg-slate-200 text-slate-700"
                                : "bg-slate-100 text-slate-600"
                            }
                          >
                            {carrier.isConnected ? "Подключён" : "Не подключён"}
                          </Badge>
                        </div>
                        {estimateText && (
                          <p className="mt-1 text-xs leading-relaxed text-slate-500">
                            {estimateText}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </>
  );
}
