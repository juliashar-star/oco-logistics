"use client";

import { FormEvent, useEffect, useState } from "react";
import { CATEGORY_TO_PROFILE, type RankedCarrier } from "@oco/core";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

const PROFILE_NULL_REASONS: Record<string, string> = {
  weight_required: "Укажите вес",
  no_active_carrier: "Подходящих активных перевозчиков для этой категории пока нет.",
  no_carrier_supports_fragile:
    "Среди подходящих перевозчиков для этой категории только Почта России умеет автоматически отмечать «хрупкое» — но она не входит в список для этого веса/габарита. Уточните возможность аккуратной упаковки напрямую у перевозчика.",
};

const P5_P6_CATEGORIES = CATEGORY_TO_PROFILE.filter((item) =>
  item.profiles.some((profile) => profile === "P5" || profile === "P6"),
).map((item) => item.category);

type CarrierWithPending = RankedCarrier & { pendingRequestAt: string | null };

type RecommendResponse = {
  profile: string | null;
  carriers?: CarrierWithPending[];
  reason?: string;
  error?: string;
};

type ConnectionRequestStatus = "idle" | "loading" | "sent" | string;

function formatRequestDate(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

const CONTRACT_ESTIMATE_UNKNOWN_PLACEHOLDER = "требует уточнения у перевозчика";

function formatContractInstruction(carrier: RankedCarrier): string {
  const base = `Вам требуется заключить прямой договор с перевозчиком. Обратитесь в ${carrier.displayName} для заключения договора.`;
  const estimate = carrier.carrierContractEstimate?.value;
  if (estimate && estimate !== CONTRACT_ESTIMATE_UNKNOWN_PLACEHOLDER) {
    return `${base} Ориентировочный срок заключения договора — ${estimate}.`;
  }
  return base;
}

function formatOcoConnectionNote(carrier: RankedCarrier): string | null {
  return carrier.ocoConnectionEstimate ? `Подключение к OCO — ${carrier.ocoConnectionEstimate}.` : null;
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
  const [requestStatuses, setRequestStatuses] = useState<Record<string, ConnectionRequestStatus>>(
    {},
  );
  const [pendingRequestAtOverrides, setPendingRequestAtOverrides] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    if (!result?.carriers) return;
    setPendingRequestAtOverrides((prev) => {
      const next = { ...prev };
      for (const carrier of result.carriers ?? []) {
        if (carrier.pendingRequestAt && next[carrier.providerKey] === undefined) {
          next[carrier.providerKey] = carrier.pendingRequestAt;
        }
      }
      return next;
    });
  }, [result]);

  function getPendingRequestAt(carrier: CarrierWithPending): string | null {
    return pendingRequestAtOverrides[carrier.providerKey] ?? carrier.pendingRequestAt ?? null;
  }

  async function handleConnectionRequest(providerKey: string) {
    setRequestStatuses((prev) => ({ ...prev, [providerKey]: "loading" }));
    try {
      const response = await fetch("/api/carrier-picker/connection-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerKey }),
      });
      const data = (await response.json()) as { ok?: boolean; createdAt?: string; error?: string };

      if (!response.ok) {
        setRequestStatuses((prev) => ({
          ...prev,
          [providerKey]: data.error || "Не удалось отправить заявку",
        }));
        return;
      }

      if (data.createdAt) {
        setPendingRequestAtOverrides((prev) => ({ ...prev, [providerKey]: data.createdAt! }));
      }
      setRequestStatuses((prev) => ({ ...prev, [providerKey]: "sent" }));
    } catch {
      setRequestStatuses((prev) => ({
        ...prev,
        [providerKey]: "Не удалось отправить заявку",
      }));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setRequestStatuses({});

    const form = event.currentTarget;
    const category = form.category.value.trim();
    const priority = (form.elements.namedItem("priority") as HTMLSelectElement).value.trim();
    const method = (form.elements.namedItem("method") as HTMLSelectElement).value.trim();
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
    const needsFragile = form.needsFragile.checked;

    setLoading(true);
    try {
      const response = await fetch("/api/carrier-picker/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, priority, method, parcel, needsFragile }),
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
          <label htmlFor="priority" className="mb-1 block text-sm font-medium text-slate-700">
            Приоритет
          </label>
          <select
            id="priority"
            name="priority"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
            defaultValue="reliable"
          >
            <option value="cheaper">Дешевле</option>
            <option value="faster">Быстрее</option>
            <option value="reliable">Надёжнее</option>
            <option value="fewer_returns">Меньше возвратов</option>
          </select>
        </div>

        <div>
          <label htmlFor="method" className="mb-1 block text-sm font-medium text-slate-700">
            Способ получения
          </label>
          <select
            id="method"
            name="method"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
            defaultValue="both"
          >
            <option value="pvz">ПВЗ</option>
            <option value="courier">Курьер</option>
            <option value="both">Курьер и ПВЗ</option>
          </select>
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

        <div className="flex items-start gap-2">
          <input
            id="needsFragile"
            name="needsFragile"
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <label htmlFor="needsFragile" className="text-sm text-slate-700">
            Хрупкое (упаковка с отметкой при погрузке)
          </label>
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
          {result.profile === null ||
          (result.reason && PROFILE_NULL_REASONS[result.reason]) ? (
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
            <>
              {carriers.some((carrier) => !carrier.isConnected) && (
                <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
                  Договоры и аккаунты со службами доставки вы оформляете напрямую с перевозчиком.
                  Кнопка «Запросить техническую интеграцию» — это сигнал команде OCO, что вам нужна
                  возможность подключить эту службу через OCO. Сама заявка не создаёт договор и не
                  подключает вас к перевозчику.
                </p>
              )}
              <ol className="space-y-3">
              {carriers.map((carrier, index) => {
                const contractInstruction = !carrier.isConnected
                  ? formatContractInstruction(carrier)
                  : null;
                const ocoNote = !carrier.isConnected ? formatOcoConnectionNote(carrier) : null;
                const pendingRequestAt = !carrier.isConnected
                  ? getPendingRequestAt(carrier)
                  : null;
                const requestStatus = requestStatuses[carrier.providerKey] ?? "idle";
                const requestError =
                  typeof requestStatus === "string" &&
                  requestStatus !== "idle" &&
                  requestStatus !== "loading" &&
                  requestStatus !== "sent"
                    ? requestStatus
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
                          {!carrier.isConnected && pendingRequestAt && (
                            <Badge className="bg-info-soft text-info">
                              Заявка на интеграцию отправлена {formatRequestDate(pendingRequestAt)}
                            </Badge>
                          )}
                        </div>
                        {contractInstruction && (
                          <p className="mt-1 text-xs leading-relaxed text-slate-500">
                            {contractInstruction}
                          </p>
                        )}
                        {ocoNote && (
                          <p className="mt-1 text-xs leading-relaxed text-slate-500">{ocoNote}</p>
                        )}
                        {!carrier.isConnected && !pendingRequestAt && (
                          <button
                            type="button"
                            disabled={requestStatus === "loading"}
                            onClick={() => handleConnectionRequest(carrier.providerKey)}
                            className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {requestStatus === "loading"
                              ? "Отправляем…"
                              : "Запросить техническую интеграцию"}
                          </button>
                        )}
                        {requestError && (
                          <p className="mt-2 text-xs text-red-600" role="alert">
                            {requestError}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
              </ol>
            </>
          )}
        </div>
      )}
    </>
  );
}
