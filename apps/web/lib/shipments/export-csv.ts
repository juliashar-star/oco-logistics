import type { PickupType, ShipmentStatus } from "@prisma/client";
import { PICKUP_TYPE_LABELS, STATUS_LABELS, formatReturnReason } from "@/lib/shipments/labels";

const MOSCOW_TIMEZONE = "Europe/Moscow";
const CSV_SEPARATOR = ";";
const CSV_LINE_BREAK = "\r\n";
const CSV_BOM = "\uFEFF";

export type ShipmentExportRow = {
  createdAt: Date;
  trackNumber: string | null;
  status: ShipmentStatus;
  carrier: { name: string } | null;
  recipientName: string;
  recipientPhone: string;
  destCity: string;
  destAddress: string | null;
  pvzCode: string | null;
  pickupType: PickupType;
  weightG: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  declaredValue: number | null;
  plannedCost: number | null;
  plannedDeliveryDays: number | null;
  plannedDeliveryDate: Date | null;
  actualCost: number | null;
  deliveredAt: Date | null;
  returnReason: string | null;
};

type CsvColumn = {
  header: string;
  getValue: (row: ShipmentExportRow) => string;
  text: boolean;
};

function formatDateTimeMoscow(date: Date): string {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: MOSCOW_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")}`;
}

function formatDateMoscow(date: Date): string {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: MOSCOW_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("day")}.${get("month")}.${get("year")}`;
}

function formatMoneyKopecks(kopecks: number | null): string {
  if (kopecks == null) return "";
  return (kopecks / 100).toFixed(2).replace(".", ",");
}

function formatWeightKg(weightG: number): string {
  const kg = weightG / 1000;
  if (Number.isInteger(kg)) {
    return String(kg);
  }
  return kg
    .toFixed(3)
    .replace(/0+$/, "")
    .replace(/\.$/, "")
    .replace(".", ",");
}

function formatDimensions(lengthCm: number, widthCm: number, heightCm: number): string {
  return `${lengthCm}×${widthCm}×${heightCm}`;
}

function sanitizeCsvInjection(value: string): string {
  if (/^[=+\-@]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

function escapeCsvCell(value: string, text: boolean): string {
  if (value === "") return "";
  const prepared = text ? sanitizeCsvInjection(value) : value;
  if (/[;"\n\r]/.test(prepared)) {
    return `"${prepared.replace(/"/g, '""')}"`;
  }
  return prepared;
}

const EXPORT_COLUMNS: CsvColumn[] = [
  {
    header: "Дата создания",
    getValue: (row) => formatDateTimeMoscow(row.createdAt),
    text: false,
  },
  {
    header: "Трек",
    getValue: (row) => row.trackNumber ?? "",
    text: true,
  },
  {
    header: "Статус",
    getValue: (row) => STATUS_LABELS[row.status],
    text: true,
  },
  {
    header: "СД",
    getValue: (row) => row.carrier?.name ?? "",
    text: true,
  },
  {
    header: "Получатель",
    getValue: (row) => row.recipientName,
    text: true,
  },
  {
    header: "Телефон",
    getValue: (row) => row.recipientPhone,
    text: true,
  },
  {
    header: "Город",
    getValue: (row) => row.destCity,
    text: true,
  },
  {
    header: "Адрес",
    getValue: (row) => row.destAddress ?? "",
    text: true,
  },
  {
    header: "ПВЗ",
    getValue: (row) => row.pvzCode ?? "",
    text: true,
  },
  {
    header: "Тип",
    getValue: (row) => PICKUP_TYPE_LABELS[row.pickupType],
    text: true,
  },
  {
    header: "Вес, кг",
    getValue: (row) => formatWeightKg(row.weightG),
    text: false,
  },
  {
    header: "Габариты, см",
    getValue: (row) => formatDimensions(row.lengthCm, row.widthCm, row.heightCm),
    text: false,
  },
  {
    header: "Объявленная ценность, ₽",
    getValue: (row) => formatMoneyKopecks(row.declaredValue),
    text: false,
  },
  {
    header: "Плановая стоимость, ₽",
    getValue: (row) => formatMoneyKopecks(row.plannedCost),
    text: false,
  },
  {
    header: "Срок, дн",
    getValue: (row) =>
      row.plannedDeliveryDays == null ? "" : String(row.plannedDeliveryDays),
    text: false,
  },
  {
    header: "Плановая доставка",
    getValue: (row) =>
      row.plannedDeliveryDate ? formatDateMoscow(row.plannedDeliveryDate) : "",
    text: false,
  },
  {
    header: "Факт. стоимость, ₽",
    getValue: (row) => formatMoneyKopecks(row.actualCost),
    text: false,
  },
  {
    header: "Факт. доставка",
    getValue: (row) => (row.deliveredAt ? formatDateTimeMoscow(row.deliveredAt) : ""),
    text: false,
  },
  {
    header: "Причина возврата/отмены",
    getValue: (row) => formatReturnReason(row.returnReason),
    text: true,
  },
];

function serializeRow(row: ShipmentExportRow): string {
  return EXPORT_COLUMNS.map((column) =>
    escapeCsvCell(column.getValue(row), column.text),
  ).join(CSV_SEPARATOR);
}

export function buildShipmentsCsv(shipments: ShipmentExportRow[]): string {
  const headerLine = EXPORT_COLUMNS.map((column) =>
    escapeCsvCell(column.header, true),
  ).join(CSV_SEPARATOR);
  const dataLines = shipments.map(serializeRow);
  return CSV_BOM + [headerLine, ...dataLines].join(CSV_LINE_BREAK);
}

export function shipmentsExportFilename(exportedAt = new Date()): string {
  const datePart = new Intl.DateTimeFormat("en-CA", {
    timeZone: MOSCOW_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(exportedAt);
  return `shipments_${datePart}.csv`;
}
