"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  isSellerReadiness,
  isStepDone,
  STEP_ORDER,
  type SellerReadinessStep,
} from "@/lib/seller-readiness";

type DashboardStatsData = {
  totalShipments: number;
  shipmentsLast30Days: number;
  shipmentsLast7Days: number;
  totalSpend: number;
  spendLast30Days: number;
  topCarriers: { name: string; count: number }[];
  readiness?: unknown;
};

/**
 * What one step says, closed or open. Keyed by step so the list above can be
 * driven by STEP_ORDER instead of repeating the order in markup.
 */
function stepContent(step: SellerReadinessStep, done: boolean): React.ReactNode {
  switch (step) {
    case "verify_email":
      // NO «отправить письмо повторно» LINK HERE. While this step is open,
      // CabinetShell is already showing VerificationBanner above the page with
      // that exact button. The step stays in the list — it is genuinely open —
      // but a second link to the same action is the double stack the form
      // avoids for the same reason.
      return done ? "Email подтверждён" : "Подтвердите email";

    case "sender_address":
      return done ? (
        "Адрес отправителя указан"
      ) : (
        <Link
          href="/dashboard/settings?tab=company"
          className="underline-offset-2 hover:underline"
        >
          Укажите город и телефон отправителя
        </Link>
      );

    case "connect_carrier":
      return done ? (
        "Перевозчик подключён"
      ) : (
        <>
          <Link
            href="/dashboard/settings?tab=connection"
            className="underline-offset-2 hover:underline"
          >
            Подключите своего перевозчика
          </Link>
          {/*
            THE WAY OUT for a seller who has no carrier contract yet. Without it
            this step is a wall: OCO signs no carrier contracts, so «подключите»
            assumes one the seller may not have. The picker needs no connection
            at all — measured.
          */}
          <br />
          <span className="text-text-3">
            Нет договора с перевозчиком?{" "}
            <Link
              href="/dashboard/carrier-picker"
              className="underline-offset-2 hover:underline"
            >
              Сравните условия в подборе
            </Link>
          </span>
        </>
      );

    case "first_shipment":
      return done ? (
        "Первое отправление создано"
      ) : (
        <Link href="/new-order" className="underline-offset-2 hover:underline">
          Создайте первое отправление
        </Link>
      );
  }
}

/** A closed step, or an open one with the links that close it. */
function StepRow({
  done,
  children,
}: {
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2 py-1.5 text-sm text-text-2">
      {done ? (
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
      <span>{children}</span>
    </li>
  );
}

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

  /**
   * The checklist lives while ANY step is open, not while there are no
   * shipments. The old condition hid it the moment a first shipment appeared,
   * even with an unverified email and no sender address behind it — and showed
   * it to a seller who had nothing left to do but wait.
   *
   * null readiness = «не знаю» (a stale route, a failed request), and «не знаю»
   * shows nothing rather than guessing which step is open.
   */
  const readiness = isSellerReadiness(stats?.readiness) ? stats.readiness : null;
  const showOnboarding = !loading && readiness !== null && !readiness.allDone;

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

      {showOnboarding && readiness && (
        <div className="mt-4 rounded-lg bg-primary-soft p-5">
          {/*
            NO NUMBER IN THE HEADING, on purpose. «Три шага» was already wrong
            the moment a fourth was added, and a count in a heading drifts away
            from the list under it every time the list changes. The steps
            themselves say how many there are.
          */}
          <h3 className="mb-3 text-sm font-semibold text-primary">
            Шаги до первой доставки
          </h3>
          {/*
            RENDERED BY STEP_ORDER, not by four rows placed in the right order by
            hand. Hand-placed rows are a second copy of the order, and a second
            copy drifts — the same defect this whole slice exists to remove. Add
            a step to the constant and it appears here, in its place.
          */}
          <ol>
            {STEP_ORDER.map((step) => (
              <StepRow key={step} done={isStepDone(readiness, step)}>
                {stepContent(step, isStepDone(readiness, step))}
              </StepRow>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
