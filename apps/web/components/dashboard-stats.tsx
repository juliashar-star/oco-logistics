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
    <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-lg border border-border bg-surface p-5"
        >
          <div className="mb-1 h-3 w-28 rounded bg-surface-2" />
          <div className="mt-1 h-8 w-20 rounded bg-surface-2" />
        </div>
      ))}
    </div>
  );
}

export function DashboardStats({
  userEmail: _userEmail,
  companyName,
  emailVerified,
}: {
  userEmail: string;
  companyName: string;
  emailVerified: boolean;
}) {
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
    <div>
      <h2 className="text-2xl font-semibold text-text">
        {emailVerified ? "Всё готово" : "Добро пожаловать"}, {companyName}
      </h2>

      {loading && (
        <>
          <p className="mt-8 text-sm text-text-3">Загрузка...</p>
          <StatsSkeleton />
        </>
      )}

      {error && !loading && (
        <p className="mt-8 rounded-lg border border-error bg-error-soft px-3 py-2 text-sm text-error">
          {error}
        </p>
      )}

      {stats && !loading && (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-surface p-5">
              <p className="mb-1 text-sm text-text-3">Всего отправлений</p>
              <p className="font-mono text-2xl font-bold text-text">
                {stats.totalShipments.toLocaleString("ru-RU")}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-5">
              <p className="mb-1 text-sm text-text-3">За 30 дней</p>
              <p className="font-mono text-2xl font-bold text-text">
                {stats.shipmentsLast30Days.toLocaleString("ru-RU")}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-5">
              <p className="mb-1 text-sm text-text-3">Расходы всего</p>
              <p className="font-mono text-2xl font-bold text-text">
                {formatRubles(stats.totalSpend)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-5">
              <p className="mb-1 text-sm text-text-3">Расходы за 30 дней</p>
              <p className="font-mono text-2xl font-bold text-text">
                {formatRubles(stats.spendLast30Days)}
              </p>
            </div>
          </div>

          {stats.topCarriers.length > 0 && (
            <div className="mt-4 rounded-lg border border-border bg-surface p-5">
              <h3 className="mb-3 text-sm font-semibold text-text">Топ перевозчиков</h3>
              <ul>
                {stats.topCarriers.map((carrier, index) => (
                  <li
                    key={`${carrier.name}-${index}`}
                    className="flex items-center justify-between border-b border-border py-2 last:border-0"
                  >
                    <span className="text-sm text-text">{carrier.name}</span>
                    <span className="font-mono text-sm text-text-2">
                      {carrier.count.toLocaleString("ru-RU")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {showOnboarding && (
        <div className="mt-4 rounded-lg bg-primary-soft p-5">
          <h3 className="mb-3 text-sm font-semibold text-primary">
            Три шага до первой доставки
          </h3>
          <ol>
            <li className="flex items-center gap-2 py-1.5 text-sm text-text-2">
              {emailVerified ? (
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center text-sm font-bold text-success"
                  aria-hidden
                >
                  ✓
                </span>
              ) : (
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-warning text-[10px] font-bold leading-none text-warning"
                  aria-hidden
                >
                  !
                </span>
              )}
              {emailVerified ? (
                <span>Email подтверждён</span>
              ) : (
                <span>
                  Подтвердите email —{" "}
                  <Link href="/verify-email" className="underline-offset-2 hover:underline">
                    отправить письмо повторно
                  </Link>
                </span>
              )}
            </li>
            <li className="flex items-center gap-2 py-1.5 text-sm text-text-2">
              <input
                type="checkbox"
                readOnly
                className="h-4 w-4 shrink-0 rounded border-border"
                aria-hidden
              />
              <Link
                href="/dashboard/settings?tab=company"
                className="underline-offset-2 hover:underline"
              >
                Указать адрес, откуда отправляете посылки
              </Link>
            </li>
            <li className="flex items-center gap-2 py-1.5 text-sm text-text-2">
              <input
                type="checkbox"
                readOnly
                className="h-4 w-4 shrink-0 rounded border-border"
                aria-hidden
              />
              <Link href="/new-order" className="underline-offset-2 hover:underline">
                Создать первую посылку
              </Link>
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
