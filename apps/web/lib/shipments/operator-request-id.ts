import { createHash } from "node:crypto";

/**
 * Deterministic Yandex `operator_request_id` from company + client idempotency key.
 *
 * Retry-safe: the same inputs always reproduce the same id, so a retried confirm
 * can hit Yandex dedupe instead of opening a second order. The ":" separator avoids
 * preimage ambiguity between pairs like ("ab","cd") and ("abc","d"). Output is
 * bounded to 36 chars (`oco-` + 32 hex) as a conservative guess against Yandex's
 * UNDOCUMENTED length limit — validate observably on the first live offers/create
 * (later slice); until then the cap is a hypothesis. Hex charset is safe; the
 * `oco-` prefix is recognizable in Yandex support tooling.
 */
export function deriveOperatorRequestId(
  companyId: string,
  idempotencyKey: string,
): string {
  const digest = createHash("sha256")
    .update(`${companyId}:${idempotencyKey}`)
    .digest("hex");
  return `oco-${digest.slice(0, 32)}`;
}
