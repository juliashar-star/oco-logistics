"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ShipmentStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { confirmWarningMessage } from "@/lib/shipments/confirm-warning-message";
import { STATUS_LABELS, formatReturnReason } from "@/lib/shipments/labels";
import {
  shipmentCarrierLabel,
  shipmentLabelCell,
  shipmentTariffLabel,
} from "@/lib/shipments/shipment-list-labels";
import { describeSyncResult } from "@/lib/shipments/describe-sync-result";
import { handoverActCandidates } from "@/lib/shipments/handover-act-candidates";
import {
  CANCEL_REQUEST_FALLBACK_ERROR_RU,
  CANCEL_REQUEST_SUCCESS_RU,
  cancelRequestErrorMessage,
} from "@/lib/shipments/cancel-request-message";
import { shipmentFooterAction } from "@/lib/shipments/shipment-footer-action";
import {
  describeBulkDeleteConfirmation,
  describeBulkDeleteResult,
} from "@/lib/shipments/describe-bulk-delete";
import { splitSelectionForDelete } from "@/lib/shipments/split-selection-for-delete";
import { exportActionLabel } from "@/lib/shipments/describe-export-action";
import { shouldShowCancelControl } from "@/lib/shipments/should-show-cancel-control";
import type { ShipmentListItemDto } from "@/lib/shipments/shipment-list-dto";
import { isHttpsUrl } from "@/lib/url/is-https-url";
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

type ShipmentRow = ShipmentListItemDto;

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
  { value: "PROBLEM", label: STATUS_LABELS.PROBLEM },
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

function renderLabelCell(shipment: ShipmentRow) {
  const label = shipmentLabelCell(shipment);
  if (label.kind === "external") {
    return (
      <a
        href={label.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        className="inline-flex rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        PDF
      </a>
    );
  }
  if (label.kind === "download") {
    return (
      <a
        href={label.href}
        download
        onClick={(event) => event.stopPropagation()}
        className="inline-flex rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        PDF
      </a>
    );
  }
  if (label.kind === "unavailable") {
    return <span className="text-sm text-slate-500">Пока недоступна</span>;
  }
  return "—";
}

/**
 * Hand the browser a file from a fetch Response. Extracted rather than written a
 * third time when bulk export arrived — three copies of the same object-URL
 * dance is three places to leak one.
 */
async function downloadResponseAsFile(response: Response, fallbackName: string) {
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? fallbackName;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ShipmentsSkeleton() {
  return (
    <TableBody>
      {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
        <TableRow key={index}>
          {Array.from({ length: 10 }).map((__, cellIndex) => (
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
  const [actPanelOpen, setActPanelOpen] = useState(false);
  const [actSelectedIds, setActSelectedIds] = useState<Set<string>>(() => new Set());
  const [actDownloading, setActDownloading] = useState(false);
  const [actError, setActError] = useState<string | null>(null);
  const [selectedShipment, setSelectedShipment] = useState<ShipmentRow | null>(null);
  const [events, setEvents] = useState<TrackingEventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);
  const [anonymizing, setAnonymizing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setTrack(trackInput), 400);
    return () => window.clearTimeout(timer);
  }, [trackInput]);

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
    setDeleteConfirmOpen(false);
    setDeleteError(null);
    setCancelConfirmOpen(false);
    setCancelError(null);
    setCancelNotice(null);
  };

  /**
   * Extracted from openDrawer so the same loader serves the initial open AND a
   * refresh after an action. Cancellation writes a TrackingEvent, and without
   * a re-fetch the seller would have to close and reopen the drawer to see the
   * thing they just did.
   */
  const loadEvents = useCallback(async (shipmentId: string) => {
    setEventsError(null);
    setEventsLoading(true);
    try {
      const response = await fetch(`/api/shipments/${shipmentId}/events`);
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
  }, []);

  const openDrawer = (shipment: ShipmentRow) => {
    setSelectedShipment(shipment);
    setEvents([]);
    setCancelError(null);
    setCancelNotice(null);
    setCancelConfirmOpen(false);
    void loadEvents(shipment.id);
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

  // Selection is dropped whenever the loaded page is replaced — a filter, a
  // track search, a status sync, a delete. Same reason the act panel re-seeds
  // itself: the seller changed what they are looking at, and carrying ticks
  // across a list they no longer see would delete or export rows that are not
  // on screen. `shipments` is a fresh array on every load, so this fires for
  // every one of those causes without enumerating them.
  useEffect(() => {
    setSelectedIds(new Set());
    setBulkConfirmOpen(false);
    setBulkError(null);
  }, [shipments]);

  const selectionSplit = splitSelectionForDelete(shipments, selectedIds);
  const selectedCount = selectionSplit.deletable.length + selectionSplit.kept.length;
  const allOnPageSelected = shipments.length > 0 && selectedCount === shipments.length;
  const someOnPageSelected = selectedCount > 0 && !allOnPageSelected;

  function toggleRowSelection(id: string) {
    setBulkNotice(null);
    setBulkError(null);
    setBulkConfirmOpen(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAllOnPage() {
    setBulkNotice(null);
    setBulkError(null);
    setBulkConfirmOpen(false);
    setSelectedIds(
      allOnPageSelected ? new Set() : new Set(shipments.map((row) => row.id)),
    );
  }

  const handleBulkDelete = async () => {
    const shipmentIds = selectionSplit.deletable;
    if (shipmentIds.length === 0) return;

    setBulkDeleting(true);
    setBulkError(null);
    setBulkNotice(null);
    try {
      const response = await fetch("/api/shipments/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentIds }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setBulkError(
          typeof data?.error === "string"
            ? data.error
            : "Не удалось удалить черновики. Попробуйте позже.",
        );
        return;
      }

      setBulkConfirmOpen(false);
      // The SERVER's count, not the count we predicted: the guard decides, and
      // a row may have stopped being a draft between the page load and now.
      setBulkNotice(
        describeBulkDeleteResult(
          typeof data?.deleted === "number" ? data.deleted : 0,
        ),
      );
      router.refresh();
      await loadShipments();
    } catch {
      setBulkError("Не удалось удалить черновики. Попробуйте позже.");
    } finally {
      setBulkDeleting(false);
    }
  };

  /**
   * The toolbar's one export. With a selection it POSTs those ids; with none it
   * GETs whatever the filters describe. Which one ran is not a secret the
   * seller has to infer — the button's own label says it, see exportActionLabel.
   *
   * The ids are taken from the rows on the page rather than from the tick set
   * directly, so an id can never be sent for a row that is no longer displayed.
   */
  const handleExportCsv = async () => {
    const shipmentIds = shipments
      .filter((row) => selectedIds.has(row.id))
      .map((row) => row.id);

    setExporting(true);
    setExportError(null);

    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (track.trim()) params.set("track", track.trim());

    try {
      const query = params.toString();
      const response =
        shipmentIds.length > 0
          ? await fetch("/api/shipments/export", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ shipmentIds }),
            })
          : await fetch(
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

      await downloadResponseAsFile(response, "shipments.csv");
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

  async function handleDeleteDraft() {
    if (!selectedShipment) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/shipments/${selectedShipment.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setDeleteError(
          "Не удалось удалить черновик. Обновите страницу или попробуйте позже.",
        );
        return;
      }
      closeDrawer();
      router.refresh();
      await loadShipments();
    } catch {
      setDeleteError(
        "Не удалось удалить черновик. Обновите страницу или попробуйте позже.",
      );
    } finally {
      setDeleting(false);
    }
  }

  async function handleCancelOrder() {
    if (!selectedShipment) return;

    setCancelling(true);
    setCancelError(null);
    setCancelNotice(null);
    try {
      const res = await fetch(`/api/shipments/${selectedShipment.id}/cancel`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        // The route's own message, VERBATIM — unlike handleDeleteDraft, which
        // shows a fixed string. The cancel route's 409s carry the only thing
        // the seller can act on (free cancellation is gone / the order is
        // finished / we cannot identify the carrier); replacing them with
        // «попробуйте позже» would tell them to retry something that can never
        // succeed. The choice is a pure function so it is testable.
        setCancelError(cancelRequestErrorMessage(data));
        return;
      }

      setCancelConfirmOpen(false);
      // The route's sentence when it sent one — it is the only side that can
      // tell «we asked just now» from «you already asked, it is still being
      // processed». The local constant is the answer for a response that has no
      // notice at all, which is exactly what an older deployment returns.
      const notice: unknown = data === null ? undefined : data.notice;
      setCancelNotice(
        typeof notice === "string" && notice.trim() !== ""
          ? notice.trim()
          : CANCEL_REQUEST_SUCCESS_RU,
      );
      // The drawer STAYS OPEN and the events are re-fetched: cancellation
      // writes a TrackingEvent, and that is the only visible result.
      //
      // The list is deliberately NOT reloaded. The route writes no status by
      // design — accepted is not cancelled — so no field on the row changes and
      // a refresh would re-render the same data. Do not add one.
      await loadEvents(selectedShipment.id);
    } catch {
      setCancelError(CANCEL_REQUEST_FALLBACK_ERROR_RU);
    } finally {
      setCancelling(false);
    }
  }

  const handleSyncStatuses = async () => {
    setSyncing(true);
    setSyncNotice(null);
    setSyncError(null);

    try {
      const response = await fetch("/api/shipments/sync-yandex-statuses", { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        setSyncError(
          response.status === 502
            ? "Не удалось обновить статусы, попробуйте позже"
            : (data.error ?? "Не удалось обновить статусы, попробуйте позже"),
        );
        return;
      }

      setSyncNotice(describeSyncResult(data));
      await loadShipments();
    } catch {
      setSyncError("Не удалось обновить статусы, попробуйте позже");
    } finally {
      setSyncing(false);
    }
  };

  const actCandidates = handoverActCandidates(shipments);
  const actSelectedCount = actCandidates.filter((c) =>
    actSelectedIds.has(c.row.id),
  ).length;

  useEffect(() => {
    if (!actPanelOpen) return;
    // Re-seed when the loaded page changes while the panel is open (filter,
    // track search, status sync). Preserving manual unchecks across a list
    // the seller just replaced would leave new CREATED rows unchecked and
    // contradict the pre-checked design — they changed what they are looking
    // at, so the panel reflects sensible defaults for that page.
    setActSelectedIds(
      new Set(
        handoverActCandidates(shipments)
          .filter((c) => c.initiallyChecked)
          .map((c) => c.row.id),
      ),
    );
  }, [actPanelOpen, shipments]);

  function openActPanel() {
    setActError(null);
    setActPanelOpen(true);
  }

  function toggleActPanel() {
    if (actPanelOpen) {
      setActPanelOpen(false);
      return;
    }
    openActPanel();
  }

  function toggleActSelection(id: string) {
    setActSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const handleDownloadHandoverAct = async () => {
    const shipmentIds = actCandidates
      .filter((c) => actSelectedIds.has(c.row.id))
      .map((c) => c.row.id);
    if (shipmentIds.length === 0) return;

    setActDownloading(true);
    setActError(null);

    try {
      const response = await fetch("/api/shipments/handover-act", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentIds }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setActError(
          typeof data.error === "string"
            ? data.error
            : "Не удалось получить акт. Попробуйте позже.",
        );
        return;
      }

      await downloadResponseAsFile(response, "handover-act.pdf");
    } catch {
      setActError("Не удалось получить акт. Попробуйте позже.");
    } finally {
      setActDownloading(false);
    }
  };

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">Отправления</h2>
        <p className="mt-2 text-slate-600">
          Все заказы вашей компании — статус, трек-номер и этикетка.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div>
            <label
              htmlFor="shipments-status-filter"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Статус
            </label>
            <select
              id="shipments-status-filter"
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
          </div>
          <div className="sm:max-w-xs sm:flex-1">
            <label
              htmlFor="shipments-track-search"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Поиск по трек-номеру
            </label>
            <Input
              id="shipments-track-search"
              type="search"
              placeholder="часть номера"
              value={trackInput}
              onChange={(event) => setTrackInput(event.target.value)}
            />
          </div>
          <div className="flex gap-2 sm:ml-auto">
            <button
              type="button"
              onClick={() => void handleExportCsv()}
              disabled={exporting}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-2 hover:bg-surface-2 disabled:opacity-60"
            >
              {exporting ? "Экспортируем..." : exportActionLabel(selectedCount)}
            </button>
            <button
              type="button"
              onClick={() => void handleSyncStatuses()}
              disabled={syncing}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-2 hover:bg-surface-2 disabled:opacity-60"
            >
              {syncing ? "Обновляем..." : "Обновить статусы"}
            </button>
            <button
              type="button"
              onClick={toggleActPanel}
              aria-expanded={actPanelOpen}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-2 hover:bg-surface-2"
            >
              Акт приёма-передачи
            </button>
          </div>
        </div>

        {actPanelOpen && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            {actCandidates.length === 0 ? (
              <p className="text-sm text-slate-600">
                На этой странице нет отправлений со статусом «Создано» или «В
                пути». Отфильтруйте список по «Создано», если нужно увидеть
                больше.
              </p>
            ) : (
              <ul className="space-y-2">
                {actCandidates.map(({ row }) => {
                  const checked = actSelectedIds.has(row.id);
                  const inTransit = row.status === "IN_TRANSIT";
                  return (
                    <li key={row.id}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-white px-3 py-2 text-sm text-slate-900 hover:bg-slate-100">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleActSelection(row.id)}
                          className="mt-1"
                        />
                        <span className="min-w-0 flex-1">
                          {row.trackNumber ? (
                            <span className="font-mono font-medium">
                              {row.trackNumber}
                            </span>
                          ) : (
                            <span className="font-medium">
                              {formatDateTime(row.createdAt)}
                              {row.destCity ? ` · ${row.destCity}` : ""}
                            </span>
                          )}
                          <span className="mt-0.5 block text-slate-600">
                            {row.recipientName}
                          </span>
                          {inTransit && (
                            <span className="mt-0.5 block text-xs text-amber-700">
                              уже в пути
                            </span>
                          )}
                        </span>
                        <Badge className={STATUS_BADGE_CLASS[row.status]}>
                          {STATUS_LABELS[row.status]}
                        </Badge>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="mt-3 text-sm text-slate-600">
              Выбрано отправлений: {actSelectedCount}. Показаны отправления с
              текущей страницы списка
              {actCandidates.length > 0
                ? " — отфильтруйте по «Создано», если нужны ещё"
                : ""}
              .
            </p>

            <div className="mt-3">
              <button
                type="button"
                onClick={() => void handleDownloadHandoverAct()}
                disabled={actSelectedCount === 0 || actDownloading}
                className="rounded-lg border border-border bg-white px-4 py-2 text-sm text-text-2 hover:bg-surface-2 disabled:opacity-60"
              >
                {actDownloading ? "Скачиваем..." : "Скачать акт"}
              </button>
            </div>
          </div>
        )}

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

        {actError && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {actError}
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

        {bulkNotice && (
          <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
            {bulkNotice}
          </p>
        )}

        {selectedCount > 0 && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            {bulkError && (
              <p
                className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
                role="alert"
              >
                {bulkError}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-slate-700">
                Выбрано отправлений: {selectedCount}
              </span>
              {!bulkConfirmOpen && (
                <button
                  type="button"
                  onClick={() => {
                    setBulkError(null);
                    setBulkConfirmOpen(true);
                  }}
                  disabled={selectionSplit.deletable.length === 0}
                  className="rounded-lg border border-border bg-white px-4 py-2 text-sm text-text-2 hover:bg-surface-2 disabled:opacity-60"
                >
                  Удалить черновики
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                Снять выбор
              </button>
            </div>

            {bulkConfirmOpen && (
              <div className="mt-3 space-y-3">
                <p className="text-sm text-slate-600">
                  {describeBulkDeleteConfirmation(
                    selectionSplit.deletable.length,
                    selectionSplit.kept.length,
                  )}{" "}
                  Черновики и всё, что к ним привязано, будут удалены. Это
                  действие необратимо.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBulkConfirmOpen(false)}
                    disabled={bulkDeleting}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleBulkDelete()}
                    disabled={bulkDeleting}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {bulkDeleting ? "Удаляем..." : "Удалить"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {(loading || total > 0) && (
          <div className="mt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Выбрать все на странице"
                      checked={allOnPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someOnPageSelected;
                      }}
                      onChange={toggleAllOnPage}
                      disabled={shipments.length === 0}
                    />
                  </TableHead>
                  <TableHead>Дата</TableHead>
                  <TableHead>Получатель</TableHead>
                  <TableHead>Перевозчик</TableHead>
                  <TableHead>Тариф</TableHead>
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
                      {/* The row's onClick opens the drawer, so this cell stops
                          the click here — without it every tick would also open
                          the parcel the seller was only trying to select. */}
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label="Выбрать отправление"
                          checked={selectedIds.has(shipment.id)}
                          onChange={() => toggleRowSelection(shipment.id)}
                        />
                      </TableCell>
                      <TableCell>{formatDateTime(shipment.createdAt)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{shipment.recipientName}</div>
                        <div className="text-sm text-slate-500">
                          {shipment.destCity}
                        </div>
                      </TableCell>
                      <TableCell>{shipmentCarrierLabel(shipment)}</TableCell>
                      <TableCell>{shipmentTariffLabel(shipment)}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_BADGE_CLASS[shipment.status]}>
                          {STATUS_LABELS[shipment.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {formatReturnReason(shipment.returnReason) || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {isHttpsUrl(shipment.trackingUrl) ? (
                          <a
                            href={shipment.trackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {shipment.trackNumber ?? "Отследить"}
                          </a>
                        ) : (
                          (shipment.trackNumber ?? "—")
                        )}
                      </TableCell>
                      <TableCell>{formatPrice(shipment.plannedCost)}</TableCell>
                      <TableCell>{renderLabelCell(shipment)}</TableCell>
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
                    {shipmentCarrierLabel(selectedShipment)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Тариф</dt>
                  <dd className="text-slate-900">
                    {shipmentTariffLabel(selectedShipment)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Трек-номер</dt>
                  <dd className="font-mono text-slate-900">
                    {selectedShipment.trackNumber ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Отслеживание</dt>
                  <dd className="text-slate-900">
                    {isHttpsUrl(selectedShipment.trackingUrl) ? (
                      <a
                        href={selectedShipment.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Отследить у перевозчика
                      </a>
                    ) : (
                      "—"
                    )}
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

              {selectedShipment.confirmWarnings.length > 0 ? (
                <ul className="mt-5 list-disc space-y-1 rounded-lg bg-amber-50 px-4 py-3 pl-8 text-sm text-amber-900/90">
                  {selectedShipment.confirmWarnings.map((code, index) => (
                    <li key={`${code}-${index}`}>
                      {confirmWarningMessage(code)}
                    </li>
                  ))}
                </ul>
              ) : null}

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

              {/* SEPARATE from shipmentFooterAction and NOT exclusive with it.
                  That helper picks one destructive action — delete OR anonymize
                  OR none — but cancelling is an orthogonal question: a CREATED
                  shipment still holding recipient data can be both cancellable
                  and anonymisable, and folding this into that enum would make
                  one silently displace the other. */}
              {shouldShowCancelControl(selectedShipment) && (
                <div className="mt-8 border-t border-slate-200 pt-6">
                  {cancelError && (
                    <p
                      className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
                      role="alert"
                    >
                      {cancelError}
                    </p>
                  )}
                  {cancelNotice && (
                    <p
                      className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
                      role="status"
                    >
                      {cancelNotice}
                    </p>
                  )}
                  {!cancelConfirmOpen ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCancelError(null);
                        setCancelNotice(null);
                        setCancelConfirmOpen(true);
                      }}
                      className="text-sm text-slate-500 hover:text-slate-700"
                    >
                      Отменить заказ
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-600">
                        Отправим перевозчику запрос на отмену. Отменяем только пока это бесплатно — если бесплатная отмена уже недоступна, мы ничего не сделаем и сообщим об этом. Статус изменится, когда перевозчик обработает запрос.
                      </p>
                      <div className="flex gap-2">
                        {/* «Назад», NOT «Отмена» as the two blocks below use:
                            in a dialog about cancelling an order, a button
                            labelled «Отмена» reads as «cancel the
                            cancellation» — the seller cannot tell which of the
                            two things it undoes. */}
                        <button
                          type="button"
                          onClick={() => {
                            setCancelConfirmOpen(false);
                            setCancelError(null);
                          }}
                          disabled={cancelling}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          Назад
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCancelOrder()}
                          disabled={cancelling}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          {cancelling ? "Отменяем..." : "Отменить заказ"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {shipmentFooterAction(selectedShipment) === "delete" && (
                <div className="mt-8 border-t border-slate-200 pt-6">
                  {deleteError && (
                    <p
                      className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
                      role="alert"
                    >
                      {deleteError}
                    </p>
                  )}
                  {!deleteConfirmOpen ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteConfirmOpen(true);
                      }}
                      className="text-sm text-slate-500 hover:text-slate-700"
                    >
                      Удалить черновик
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-600">
                        Черновик и всё, что к нему привязано, будут удалены. Это
                        действие необратимо.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteConfirmOpen(false);
                            setDeleteError(null);
                          }}
                          disabled={deleting}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          Отмена
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteDraft()}
                          disabled={deleting}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          {deleting ? "Удаляем..." : "Удалить"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {shipmentFooterAction(selectedShipment) === "anonymize" && (
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
                      {/*
                        Wording is a decision, not copy — see docs/ANONYMIZATION.md §9.
                        Irreversibility leads. What SURVIVES is named on purpose: without
                        it the seller reads this as losing the shipment itself. No
                        «УДАЛЕНО», no null, no «обезличивание» — the promise must outlive
                        the mechanics it used to describe.
                      */}
                      <p className="text-sm text-slate-600">
                        Это действие необратимо. Имя, телефон и адрес получателя
                        будут удалены, а вместе с ними — сохранённые варианты
                        доставки, из которых вы выбирали. Номер заказа у
                        перевозчика, трек-номер и статусы доставки останутся:
                        отправление не пропадёт.
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
