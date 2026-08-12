import { mapCdekStatusToShipmentStatus } from "./map-status";

/**
 * What undoing a CDEK order would cost, judged from its status timeline.
 *
 * "deletable"   — DELETE /v2/orders/{uuid} still applies: the goods have not
 *                 reached the sender's warehouse, so the order can genuinely be
 *                 removed.
 * "not_free"    — only POST /v2/orders/{uuid}/refusal remains, which the spec
 *                 warns is a chargeable operation that lands in the Акт
 *                 оказанных услуг.
 * "unavailable" — nothing can be done: already delivered, already not-delivered,
 *                 or already removed.
 * "unknown"     — we could not read the timeline well enough to say.
 */
export type CdekCancelWindow =
  | "deletable"
  | "not_free"
  | "unavailable"
  | "unknown";

/**
 * The boundary, from «Приложение 1. Статусы заказов» as quoted in
 * docs/research/cdek-cancel-2026-08-11.md:41-46 —
 *   0 ACCEPTED  «Принят»   1 CREATED «Создан»
 *   2 REMOVED   «Удален»   3 RECEIVED_AT_SHIPMENT_WAREHOUSE «Принят на склад отправителя»
 *   4 DELIVERED «Вручен»   5 NOT_DELIVERED «Не вручен»
 * and the rule the note draws from them (:50-52): DELETE works up to status 3,
 * from 3 onward only the chargeable refusal, and at 4 or 5 nothing.
 */
const DELETABLE_CODES = new Set(["ACCEPTED", "CREATED"]);

/** Terminal, plus REMOVED — an order already cancelled cannot be cancelled. */
const UNAVAILABLE_CODES = new Set(["DELIVERED", "NOT_DELIVERED", "REMOVED"]);

type StatusEntry = { code: string; at: number };

/**
 * TWO KINDS OF NON-ENTRY, and they are not interchangeable.
 *
 * "retracted" — `deleted === true`. A documented retraction whose meaning we
 *   understand: CDEK is telling us this status no longer counts.
 * "unreadable" — a missing code, a missing or unparseable date_time, a
 *   non-object. We do not know what this entry said.
 */
type ReadResult = StatusEntry | "retracted" | "unreadable";

/**
 * Read one raw `entity.statuses[]` entry. Mirrors mapCdekStatusEntry in
 * cdek/client.ts: `deleted === true` is skipped, and a missing code or
 * date_time drops the entry. Kept in step with that function deliberately —
 * a status the timeline refuses to show must not decide a cancellation either.
 */
function readEntry(raw: unknown): ReadResult {
  if (raw === null || typeof raw !== "object") {
    return "unreadable";
  }
  const entry = raw as Record<string, unknown>;
  if (entry.deleted === true) {
    return "retracted";
  }
  const code = typeof entry.code === "string" ? entry.code.trim() : "";
  const dateTime =
    typeof entry.date_time === "string" ? entry.date_time.trim() : "";
  if (!code || !dateTime) {
    return "unreadable";
  }
  const at = Date.parse(dateTime);
  if (!Number.isFinite(at)) {
    return "unreadable";
  }
  return { code, at };
}

/**
 * Decide the cancellation window from the raw statuses array.
 *
 * IT SORTS FOR ITSELF, and that is not defensive habit. The CDEK spec describes
 * `statuses` as sorted, but our own measured sample came back NEWEST FIRST — the
 * two disagree, and this is the first consumer whose answer depends on which is
 * right. getOrderHistory deliberately does not sort («the sync sorts ascending
 * by eventAt itself»), so inheriting its order would inherit the ambiguity.
 * Sorting descending by parsed date_time and taking the newest is correct under
 * either convention.
 *
 * "unknown" IS NOT PERMISSION. It means the timeline was empty, every entry was
 * dropped, or the newest code is one this table has never seen — in every case
 * we do not know where the parcel is. A caller must refuse on "unknown" rather
 * than fall through to a delete: guessing wrong here either destroys an order
 * that was moving or bills the seller for a refusal they did not ask for.
 */
export function mapCdekCancelWindow(statuses: unknown): CdekCancelWindow {
  if (!Array.isArray(statuses)) {
    return "unknown";
  }

  const entries: StatusEntry[] = [];
  let unreadable = 0;
  for (const raw of statuses) {
    const entry = readEntry(raw);
    if (entry === "unreadable") {
      unreadable += 1;
    } else if (entry !== "retracted") {
      entries.push(entry);
    }
  }
  if (entries.length === 0) {
    return "unknown";
  }

  entries.sort((a, b) => b.at - a.at);
  const newest = entries[0]!.code;

  if (DELETABLE_CODES.has(newest)) {
    // THE GUARD IS ONE-SIDED ON PURPOSE — do not "tidy" it into symmetry.
    //
    // Dropping an entry can only ever remove a NEWER status and leave an OLDER
    // one as the newest. Older means earlier in the order's life, and earlier is
    // the PERMISSIVE direction: an unparseable RECEIVED_AT_SHIPMENT_WAREHOUSE
    // falls away and the CREATED beneath it would authorise deleting an order
    // that has already reached the warehouse.
    //
    // So the guard sits where the consequence is. On "not_free" and
    // "unavailable" a wrong answer costs a misleading sentence; here it costs an
    // order. Refusing more often than necessary is not free either, which is
    // exactly why this does not fire on the other two branches.
    return unreadable > 0 ? "unknown" : "deletable";
  }
  if (UNAVAILABLE_CODES.has(newest)) {
    return "unavailable";
  }

  // Any OTHER code CDEK's own table knows about means the parcel has moved:
  // only the chargeable refusal is left. The vocabulary is not copied here —
  // mapCdekStatusToShipmentStatus already carries «Приложение 1» verbatim and
  // returns null for anything outside it, so this asks that table rather than
  // keeping a second list that could drift away from it.
  if (mapCdekStatusToShipmentStatus(newest) !== null) {
    return "not_free";
  }

  return "unknown";
}
