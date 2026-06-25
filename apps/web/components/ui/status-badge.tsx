import type { ShipmentStatus } from "@prisma/client";
import { STATUS_LABELS } from "@/lib/shipments/labels";

type StatusBadgeProps = {
  status: string;
};

const VARIANT_MAP: Record<string, string> = {
  draft: "bg-surface-2 text-text-2",
  черновик: "bg-surface-2 text-text-2",
  created: "bg-info-soft text-info",
  создано: "bg-info-soft text-info",
  in_transit: "bg-primary-soft text-primary",
  "в пути": "bg-primary-soft text-primary",
  delivered: "bg-success-soft text-success",
  доставлено: "bg-success-soft text-success",
  returned: "bg-warning-soft text-warning",
  возврат: "bg-warning-soft text-warning",
  error: "bg-error-soft text-error",
  ошибка: "bg-error-soft text-error",
  проблема: "bg-error-soft text-error",
  on_pickup: "bg-info-soft text-info",
  at_pvz: "bg-info-soft text-info",
  "на пвз": "bg-info-soft text-info",
  problem: "bg-error-soft text-error",
  cancelled: "bg-surface-2 text-text-3",
  canceled: "bg-surface-2 text-text-3",
  отменено: "bg-surface-2 text-text-3",
};

const DEFAULT_VARIANT = "bg-surface-2 text-text-2";

function normalizeStatusKey(status: string): string {
  return status.toLowerCase().trim().replace(/-/g, "_");
}

function getVariant(status: string): string {
  const key = normalizeStatusKey(status);
  return VARIANT_MAP[key] ?? DEFAULT_VARIANT;
}

function getDisplayLabel(status: string): string {
  const enumKey = status.toUpperCase().replace(/-/g, "_") as ShipmentStatus;
  if (enumKey in STATUS_LABELS) {
    return STATUS_LABELS[enumKey];
  }

  const normalized = normalizeStatusKey(status);
  for (const [key, label] of Object.entries(STATUS_LABELS)) {
    if (normalizeStatusKey(label) === normalized) {
      return label;
    }
  }

  if (status.length === 0) {
    return status;
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const variant = getVariant(status);
  const label = getDisplayLabel(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${variant}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}
