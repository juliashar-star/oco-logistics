/**
 * claims/cancel-info body → what cancelling this claim would cost us.
 *
 * Pure: no network, no clock, no credentials. The caller does the HTTP and
 * hands the parsed body straight in, so the decision itself stays testable in
 * milliseconds and cannot drift with the transport.
 *
 * Documented enum (docs/research/yandex-express-api-2026-07-27.md:296):
 * `cancel_state` is `free` | `paid` | `unavailable`.
 */
export type CancelState = "free" | "not_free" | "unavailable";

/**
 * FAILS CLOSED, and this is the whole point of the function.
 *
 * Every input that is not one of the three documented strings — a missing key,
 * a blank, a number, an unknown string, a non-object body, null — returns
 * "not_free". NOT "free", and not "unavailable" either.
 *
 * WHY: "free" is permission to spend the seller's money. An answer we could not
 * read is not permission; it is an absence of one. Defaulting to "free" would
 * turn every parse failure, every silently renamed enum member and every
 * truncated body into a chargeable cancellation the seller never agreed to,
 * and they would find out from an invoice. "not_free" is the conservative
 * answer because it stops ОСО from acting and hands the decision back.
 *
 * "unavailable" is not the safe default either: it would tell the seller
 * nothing can be done, which may be false, and would hide a working
 * cancellation behind our own parse bug.
 */
export function mapCancelState(body: unknown): CancelState {
  if (body === null || typeof body !== "object") {
    return "not_free";
  }

  if (!("cancel_state" in body)) {
    return "not_free";
  }

  const raw = (body as { cancel_state: unknown }).cancel_state;
  if (typeof raw !== "string") {
    return "not_free";
  }

  switch (raw.trim()) {
    case "free":
      return "free";
    case "paid":
      return "not_free";
    case "unavailable":
      return "unavailable";
    default:
      return "not_free";
  }
}
