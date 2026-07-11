"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ShipmentStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, formatReturnReason } from "@/lib/shipments/labels";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ShipmentRow = {
  id: string;
  createdAt: string;
  status: ShipmentStatus;
  trackNumber: string | null;
  labelUrl: string | null;
  recipientName: string;
  destCity: string;
  plannedCost: number | null;
  plannedDeliveryDays: number | null;
  returnReason: string | null;
  isAnonymized: boolean;
  carrier: { name: string } | null;
};

type TrackingEventRow = {
  statusCode: string;
  statusText: string;
  eventAt: string;
};

const STATUS_OPTIONS: { value: ShipmentStatus | ""; label: string }[] = [
  { value: "", label: "Все статусы" },
  { value: "DRAFT", label: "Черновик" },
  { value: "CREATED", label: "Создано" },
  { value: "IN_TRANSIT", label: "В пути" },
  { value: "AT_PVZ", label: "На ПВЗ" },
  { value: "DELIVERED", label: "Доставлено" },
  { value: "RETURNED", label: "Возврат" },
  { value: "CANCELED", label: "Отменено" },
  { value: "PROBLEM", label: "Проблема" },
];

const STATUS_BADGE_CLASS: Record<ShipmentStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SUBMITTING: "bg-indigo-100 text-indigo-800",
  CREATED: "bg-blue-100 text-blue-800",
  IN_TRANSIT: "bg-amber-100 text-amber-800",
  AT_PVZ: "bg-amber-50 text-amber-700",
  DELIVERED: "bg-emerald-100 text-emerald-800",
  RETURNED: "bg-slate-100 text-slate-600",
  CANCELED: "bg-slate-100 text-slate-600",
  PROBLEM: "bg-red-100 text-red-800",
};

const SKELETON_ROWS = 4;

function formatDate(iso: string): string {
  const date = new Date(iso);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function formatPrice(kopecks: number | null): string {
  if (kopecks == null) return "—";
  return `${(kopecks / 100).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₽`;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ShipmentsSkeleton() {
  return (
    <TableBody>
      {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
        <TableRow key={index}>
          {Array.from({ length: 8 }).map((__, cellIndex) => (
            <TableCell key={cellIndex}>
              <div className="h-4 animate-pulse rounded bg-slate-200" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  );
}

export function ShipmentsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<ShipmentStatus | "">("");
  const [trackInput, setTrackInput] = useState("");
  const [track, setTrack] = useState("");
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [selectedShipment, setSelectedShipment] = useState<ShipmentRow | null>(null);
  const [events, setEvents] = useState<TrackingEventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [anonymizing, setAnonymizing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setTrack(trackInput), 400);
    return () => window.clearTimeout(timer);
  }, [trackInput]);

  useEffect(() => {
    if (!syncNotice) return;
    const timer = window.setTimeout(() => setSyncNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [syncNotice]);

  useEffect(() => {
    if (!selectedShipment) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedShipment]);

  const closeDrawer = () => {
    setSelectedShipment(null);
    setEvents([]);
    setEventsLoading(false);
    setEventsError(null);
    setConfirmOpen(false);
  };

  const openDrawer = (shipment: ShipmentRow) => {
    setSelectedShipment(shipment);
    setEvents([]);
    setEventsError(null);
    setEventsLoading(true);

    void (async () => {
      try {
        const response = await fetch(`/api/shipments/${shipment.id}/events`);
        const data = await response.json();

        if (!response.ok) {
          setEventsError(data.error ?? "Не удалось загрузить историю");
          return;
        }

        setEvents(data.events ?? []);
      } catch {
        setEventsError("Что-то пошло не так. Обновите страницу или попробуйте через минуту.");
      } finally {
        setEventsLoading(false);
      }
    })();
  };

  const hasActiveFilters = status !== "" || track.trim() !== "";

  const loadShipments = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ limit: "50" });
    if (status) params.set("status", status);
    if (track.trim()) params.set("track", track.trim());

    try {
      const response = await fetch(`/api/shipments?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Не удалось загрузить отправления");
        setShipments([]);
        setTotal(0);
        return;
      }

      setShipments(data.shipments ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError("Что-то пошло не так. Обновите страницу или попробуйте через минуту.");
      setShipments([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [status, track]);

  useEffect(() => {
    void loadShipments();
  }, [loadShipments]);

  const handleExportCsv = async () => {
    setExporting(true);
    setExportError(null);

    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (track.trim()) params.set("track", track.trim());

    try {
      const query = params.toString();
      const response = await fetch(
        query ? `/api/shipments/export?${query}` : "/api/shipments/export",
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setExportError(
          typeof data.error === "string"
            ? data.error
            : "Не удалось экспортировать отправления",
        );
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "shipments.csv";

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Не удалось экспортировать отправления");
    } finally {
      setExporting(false);
    }
  };

  async function handleAnonymize() {
    if (!selectedShipment) return;

    setAnonymizing(true);
    try {
      const res = await fetch(`/api/shipments/${selectedShipment.id}/anonymize`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      closeDrawer();
      router.refresh();
      await loadShipments();
    } catch {
      // show nothing — button re-enables
    } finally {
      setAnonymizing(false);
      setConfirmOpen(false);
    }
  }

  const handleSyncStatuses = async () => {
    setSyncing(true);
    setSyncNotice(null);
    setSyncError(null);

    try {
      const response = await fetch("/api/shipments/sync-statuses", { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        setSyncError(
          response.status === 502
            ? "Не удалось обновить статусы, попробуйте позже"
            : (data.error ?? "Не удалось обновить статусы, попробуйте позже"),
        );
        return;
      }

      setSyncNotice(
        `Статусы обновлены: ${data.updated ?? 0} посылок, ${data.events ?? 0} новых событий`,
      );
      await loadShipments();
    } catch {
      setSyncError("Не удалось обновить статусы, попробуйте позже");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">Отправления</h2>
        <p className="mt-2 text-slate-600">
          Все заказы вашей компании — статус, трек-номер и этикетка.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as ShipmentStatus | "")
            }
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Input
            type="search"
            placeholder="Поиск по трек-номеру"
            value={trackInput}
            onChange={(event) => setTrackInput(event.target.value)}
            className="sm:max-w-xs"
          />
          <div className="flex gap-2 sm:ml-auto">
            <button
              type="button"
              onClick={() => void handleExportCsv()}
              disabled={exporting}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-2 hover:bg-surface-2 disabled:opacity-60"
            >
              {exporting ? "Экспортируем..." : "Экспорт CSV"}
            </button>
            <button
              type="button"
              onClick={() => void handleSyncStatuses()}
              disabled={syncing}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-2 hover:bg-surface-2 disabled:opacity-60"
            >
              {syncing ? "Обновляем..." : "Обновить статусы"}
            </button>
          </div>
        </div>

        {syncNotice && (
          <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
            {syncNotice}
          </p>
        )}

        {syncError && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {syncError}
          </p>
        )}

        {exportError && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {exportError}
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        {!loading && !error && total === 0 && !hasActiveFilters && (
          <EmptyState
            illustration="shipments"
            title="Здесь будет ваша логистика"
            description="Создайте первое отправление — OCO рассчитает тарифы и выберет лучшего перевозчика."
            actionLabel="+ Создать отправление"
            onAction={() => router.push("/new-order")}
          />
        )}

        {!loading && !error && total === 0 && hasActiveFilters && (
          <p className="mt-8 text-center text-sm text-slate-600">
            По этому фильтру ничего нет — попробуйте другой статус или сбросьте поиск.
          </p>
        )}

        {(loading || total > 0) && (
          <div className="mt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Получатель</TableHead>
                  <TableHead>Перевозчик</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Причина</TableHead>
                  <TableHead>Трек</TableHead>
                  <TableHead>Цена</TableHead>
                  <TableHead>Этикетка</TableHead>
                </TableRow>
              </TableHeader>
              {loading ? (
                <ShipmentsSkeleton />
              ) : total > 0 ? (
                <TableBody>
                  {shipments.map((shipment) => (
                    <TableRow
                      key={shipment.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => openDrawer(shipment)}
                    >
                      <TableCell>{formatDateTime(shipment.createdAt)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{shipment.recipientName}</div>
                        <div className="text-sm text-slate-500">
                          {shipment.destCity}
                        </div>
                      </TableCell>
                      <TableCell>{shipment.carrier?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_BADGE_CLASS[shipment.status]}>
                          {STATUS_LABELS[shipment.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {formatReturnReason(shipment.returnReason) || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {shipment.trackNumber ?? "—"}
                      </TableCell>
                      <TableCell>{formatPrice(shipment.plannedCost)}</TableCell>
                      <TableCell>
                        {shipment.labelUrl ? (
                          <a
                            href={shipment.labelUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            PDF
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              ) : null}
            </Table>
          </div>
        )}
      </div>

      {selectedShipment && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Закрыть"
            className="absolute inset-0 bg-slate-900/30"
            onClick={closeDrawer}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="shipment-drawer-title"
            className="relative flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 id="shipment-drawer-title" className="text-lg font-semibold text-slate-900">
                  Отправление
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {formatDate(selectedShipment.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Закрыть
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-slate-500">Получатель</dt>
                  <dd className="font-medium text-slate-900">
                    {selectedShipment.isAnonymized
                      ? "Данные получателя удалены"
                      : selectedShipment.recipientName}
                  </dd>
                </div>
                {!selectedShipment.isAnonymized && (
                  <div>
                    <dt className="text-slate-500">Город</dt>
                    <dd className="text-slate-900">{selectedShipment.destCity}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-slate-500">Перевозчик</dt>
                  <dd className="text-slate-900">
                    {selectedShipment.carrier?.name ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Трек-номер</dt>
                  <dd className="font-mono text-slate-900">
                    {selectedShipment.trackNumber ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Статус</dt>
                  <dd className="mt-1">
                    <Badge className={STATUS_BADGE_CLASS[selectedShipment.status]}>
                      {STATUS_LABELS[selectedShipment.status]}
                    </Badge>
                  </dd>
                </div>
                {selectedShipment.returnReason && (
                  <div>
                    <dt className="text-slate-500">Причина</dt>
                    <dd className="text-slate-900">
                      {formatReturnReason(selectedShipment.returnReason)}
                    </dd>
                  </div>
                )}
              </dl>

              <div className="mt-8">
                <h4 className="text-sm font-semibold text-slate-900">История статусов</h4>

                {eventsLoading && (
                  <div className="mt-4 space-y-4">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={index} className="h-10 animate-pulse rounded bg-slate-200" />
                    ))}
                  </div>
                )}

                {!eventsLoading && eventsError && (
                  <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                    {eventsError}
                  </p>
                )}

                {!eventsLoading && !eventsError && events.length === 0 && (
                  <p className="mt-4 text-sm text-slate-600">
                    История появится после первого обновления статусов
                  </p>
                )}

                {!eventsLoading && !eventsError && events.length > 0 && (
                  <ol className="relative mt-4 space-y-0 border-l border-slate-200 pl-4">
                    {events.map((event, index) => {
                      const isLatest = index === events.length - 1;

                      return (
                        <li key={`${event.statusCode}-${event.eventAt}`} className="relative pb-6 last:pb-0">
                          <span
                            className={`absolute -left-[1.375rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${
                              isLatest ? "bg-slate-900" : "bg-slate-300"
                            }`}
                          />
                          <p
                            className={`text-sm ${
                              isLatest
                                ? "font-semibold text-slate-900"
                                : "text-slate-700"
                            }`}
                          >
                            {event.statusText}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatDateTime(event.eventAt)}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>

              {!selectedShipment.isAnonymized && (
                <div className="mt-8 border-t border-slate-200 pt-6">
                  {!confirmOpen ? (
                    <button
                      type="button"
                      onClick={() => setConfirmOpen(true)}
                      className="text-sm text-slate-500 hover:text-slate-700"
                    >
                      Удалить данные получателя
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-600">
                        Данные получателя будут заменены на «УДАЛЕНО». Это действие необратимо.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmOpen(false)}
                          disabled={anonymizing}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          Отмена
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleAnonymize()}
                          disabled={anonymizing}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          {anonymizing ? "Удаляем..." : "Удалить"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
