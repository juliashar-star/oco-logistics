"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ShipmentStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
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
  carrier: { name: string } | null;
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

const STATUS_LABELS: Record<ShipmentStatus, string> = {
  DRAFT: "Черновик",
  CREATED: "Создано",
  IN_TRANSIT: "В пути",
  AT_PVZ: "На ПВЗ",
  DELIVERED: "Доставлено",
  RETURNED: "Возврат",
  CANCELED: "Отменено",
  PROBLEM: "Проблема",
};

const STATUS_BADGE_CLASS: Record<ShipmentStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
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

function ShipmentsSkeleton() {
  return (
    <TableBody>
      {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
        <TableRow key={index}>
          {Array.from({ length: 7 }).map((__, cellIndex) => (
            <TableCell key={cellIndex}>
              <div className="h-4 animate-pulse rounded bg-slate-200" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  );
}

export default function ShipmentsPage() {
  const [status, setStatus] = useState<ShipmentStatus | "">("");
  const [trackInput, setTrackInput] = useState("");
  const [track, setTrack] = useState("");
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setTrack(trackInput), 400);
    return () => window.clearTimeout(timer);
  }, [trackInput]);

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
      setError("Не удалось связаться с сервером");
      setShipments([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [status, track]);

  useEffect(() => {
    void loadShipments();
  }, [loadShipments]);

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900">Отправления</h2>
          <p className="mt-2 text-slate-600">
            Все заказы вашей компании — статус, трек-номер и этикетка.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
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
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          {!loading && !error && total === 0 && !hasActiveFilters && (
            <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <p className="font-medium text-slate-900">Отправлений пока нет</p>
              <p className="mt-2 text-sm text-slate-600">
                Создайте первый заказ — он появится в этом списке.
              </p>
              <Link
                href="/new-order"
                className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
              >
                Создать первое отправление
              </Link>
            </div>
          )}

          {!loading && !error && total === 0 && hasActiveFilters && (
            <p className="mt-8 text-center text-sm text-slate-600">
              Ничего не найдено — попробуйте изменить фильтры.
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
                      <TableRow key={shipment.id}>
                        <TableCell>{formatDate(shipment.createdAt)}</TableCell>
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
      </main>
    </div>
  );
}
