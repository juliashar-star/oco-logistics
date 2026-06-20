import type { PickupType, ShipmentStatus } from "@prisma/client";

export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  DRAFT: "Черновик",
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
