"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type DashboardStatsData = {
  totalShipments: number;
  shipmentsLast30Days: number;
  shipmentsLast7Days: number;
  totalSpend: number;
  spendLast30Days: number;
  topCarriers: { name: string; count: number }[];
};

function formatRubles(amount: number): string {
  return `${amount.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ₽`;
}

function StatsSkeleton() {
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-xl border border-slate-200 bg-slate-50 p-5"
        >
          <div className="h-4 w-28 rounded bg-slate-200" />
          <div className="mt-3 h-8 w-20 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

export function DashboardStats({ userEmail }: { userEmail: string }) {
  const [stats, setStats] = useState<DashboardStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/dashboard/stats");
        const data = (await response.json()) as DashboardStatsData & { error?: string };

        if (!response.ok) {
          throw new Error(data.error ?? "Не удалось загрузить статистику");
        }

        if (!cancelled) {
          setStats(data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Не удалось загрузить статистику. Попробуйте позже.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadStats();

    return () => {
      cancelled = true;
    };
  }, []);

  const showOnboarding = !loading && stats?.totalShipments === 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
        Добро пожаловать
      </p>
      <h2 className="mt-2 text-2xl font-semibold text-slate-900">Кабинет готов к работе</h2>
      <p className="mt-3 text-slate-600">
        Вы вошли как <span className="font-medium text-slate-900">{userEmail}</span>.
      </p>

      {loading && (
        <>
          <p className="mt-8 text-sm text-slate-500">Загрузка...</p>
          <StatsSkeleton />
        </>
      )}

      {error && !loading && (
        <p className="mt-8 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {stats && !loading && (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Всего отправлений</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {stats.totalShipments.toLocaleString("ru-RU")}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm text-slate-500">За 30 дней</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {stats.shipmentsLast30Days.toLocaleString("ru-RU")}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Расходы всего</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {formatRubles(stats.totalSpend)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Расходы за 30 дней</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {formatRubles(stats.spendLast30Days)}
              </p>
            </div>
          </div>

          {stats.topCarriers.length > 0 && (
            <div className="mt-8">
              <h3 className="font-medium text-slate-900">Топ перевозчиков</h3>
              <ol className="mt-4 space-y-3">
                {stats.topCarriers.map((carrier, index) => (
                  <li
                    key={`${carrier.name}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-medium text-white">
                        {index + 1}
                      </span>
                      <p className="font-medium text-slate-900">{carrier.name}</p>
                    </div>
                    <p className="text-sm text-slate-600">
                      {carrier.count.toLocaleString("ru-RU")}{" "}
                      {carrier.count === 1
                        ? "отправление"
                        : carrier.count >= 2 && carrier.count <= 4
                          ? "отправления"
                          : "отправлений"}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}

      {showOnboarding && (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6">
          <h3 className="font-medium text-slate-900">С чего начать</h3>
          <ol className="mt-4 space-y-3 text-sm text-slate-600">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-medium text-white">
                1
              </span>
              <Link href="/settings" className="text-slate-900 underline-offset-2 hover:underline">
                Подключите APIShip в настройках
              </Link>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-medium text-white">
                2
              </span>
              Укажите адрес отправителя (скоро — US-2.2)
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-medium text-white">
                3
              </span>
              <Link href="/new-order" className="text-slate-900 underline-offset-2 hover:underline">
                Рассчитайте первое отправление
              </Link>
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
