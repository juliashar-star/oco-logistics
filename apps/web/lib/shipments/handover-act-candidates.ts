/**
 * Pre-selects sensible rows for the handover-act panel from what the browser
 * already holds. The SERVER is the authority on eligibility (status gate,
 * providerOrderId, service mix, cap) — this function only shapes the default
 * checkbox state so the seller's first click is useful. Do not treat it as a
 * client-side copy of the service rules.
 *
 * `providerKey != null` is the same client-side proxy for «has a carrier order»
 * that shipmentLabelCell already uses (both columns are written in the same
 * update in submit-order.ts; legacy APIShip rows have neither). Do not add a
 * second DTO field or a second way of asking — that would drift.
 */
export type HandoverActCandidate<
  T extends { status: string; providerKey: string | null },
> = {
  row: T;
  initiallyChecked: boolean;
};

export function handoverActCandidates<
  T extends { status: string; providerKey: string | null },
>(rows: readonly T[]): HandoverActCandidate<T>[] {
  const out: HandoverActCandidate<T>[] = [];
  for (const row of rows) {
    if (row.providerKey == null) continue;
    if (row.status === "CREATED") {
      out.push({ row, initiallyChecked: true });
    } else if (row.status === "IN_TRANSIT") {
      out.push({ row, initiallyChecked: false });
    }
  }
  return out;
}
