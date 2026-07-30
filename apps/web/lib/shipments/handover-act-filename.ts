import { MOSCOW_TIMEZONE } from "../date/format-date-moscow";

/**
 * Attachment name for an акт приёма-передачи download.
 * Date is the Moscow calendar day of `date` — same zone as other seller-facing
 * logistics dates — so two acts from different days do not collide as
 * `handover-act (1).pdf` in Downloads. No shipment ids, operator ids, or PII.
 */
export function handoverActFilename(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MOSCOW_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `handover-act-${get("year")}-${get("month")}-${get("day")}.pdf`;
}
