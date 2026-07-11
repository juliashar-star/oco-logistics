import type { PickupType, ShipmentStatus } from "@prisma/client";

export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  DRAFT: "Черновик",
  SUBMITTING: "Оформляется…",
  CREATED: "Создано",
  IN_TRANSIT: "В пути",
  AT_PVZ: "На ПВЗ",
  DELIVERED: "Доставлено",
  RETURNED: "Возврат",
  CANCELED: "Отменено",
  PROBLEM: "Проблема",
};

export const PICKUP_TYPE_LABELS: Record<PickupType, string> = {
  COURIER: "Курьер",
  PVZ: "ПВЗ",
};

export const REASON_LABELS: Record<string, string> = {
  returned: "Возврат",
  returning: "В процессе возврата",
  returnReady: "Готов к возврату",
  returnedFromDelivery: "Возврат при доставке",
  partialReturn: "Частичный возврат",
  deliveryCanceled: "Отменено службой доставки",
};

export function formatReturnReason(code: string | null | undefined): string {
  if (code == null || code.trim() === "") {
    return "";
  }
  const trimmed = code.trim();
  return REASON_LABELS[trimmed] ?? trimmed;
}
