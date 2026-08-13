import { DEFAULT_ORDER_ADAPTER_KEY } from "./order-adapter-seller-titles";

/**
 * Allow-list (not deny-list): a status added later must default to refusing,
 * not to serving a PDF. Only these three are known-safe for a printed label.
 *
 * CANCELED is refused on purpose: measured 29.07, the carrier DOES return a
 * PDF for a cancelled order — so this refusal is ours and deliberate. A
 * printed label on a cancelled order ends as a parcel nobody collects.
 *
 * Shared by getShipmentLabel (server) and the shipments-list cell (browser) —
 * one source of truth, no duplication.
 */
export const LABEL_ALLOWED_STATUSES: ReadonlySet<string> = new Set([
  "CREATED",
  "IN_TRANSIT",
  "AT_PVZ",
]);

export function isLabelAllowedStatus(status: string): boolean {
  return LABEL_ALLOWED_STATUSES.has(status);
}

/**
 * Which order-adapter keys expose generateLabels.
 * Client-safe — MUST NOT import order-adapters (Node builtins → browser bundle).
 * Drift-tested in Node against ORDER_ADAPTERS for every registry key.
 */
export const ORDER_ADAPTER_LABEL_SUPPORT: Readonly<Record<string, boolean>> = {
  "yataxi:next_day": true,
  "yataxi:express": false,
  "yataxi:courier": false,
  // No generateLabels on cdek:delivery yet — confirm/cancel are stubs too.
  "cdek:delivery": false,
};

/**
 * Null/empty/unknown key → default entry (same rule as resolveOrderAdapter),
 * and the default (next_day) HAS labels.
 */
export function orderAdapterSupportsLabel(
  adapterKey: string | null | undefined,
): boolean {
  if (adapterKey == null || adapterKey === "") {
    return ORDER_ADAPTER_LABEL_SUPPORT[DEFAULT_ORDER_ADAPTER_KEY]!;
  }
  // OWN keys only — see orderAdapterSellerTitle. A prototype member is truthy,
  // so an unguarded index made this report «has a label» for a key that is not
  // an adapter at all.
  const found = Object.prototype.hasOwnProperty.call(
    ORDER_ADAPTER_LABEL_SUPPORT,
    adapterKey,
  )
    ? ORDER_ADAPTER_LABEL_SUPPORT[adapterKey]
    : undefined;
  if (found === undefined) {
    console.error(
      "[order-adapter-label-support] UNKNOWN_ORDER_ADAPTER_KEY",
      JSON.stringify({ adapterKey }),
    );
    return ORDER_ADAPTER_LABEL_SUPPORT[DEFAULT_ORDER_ADAPTER_KEY]!;
  }
  return found;
}
