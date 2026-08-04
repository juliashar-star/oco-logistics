import type { SelectedOrderAdapter } from "./select-order-adapters-for-connected-carriers";

/**
 * WHY: a pickup point belongs to exactly one network. Today the fan-out asks
 * every connected carrier regardless. With a CDEK point, Yandex is called with
 * a CDEK office code as its station id and fails, and the swallowed failure
 * only LOOKS correct. With a Yandex point, CDEK quotes happily — it never sees
 * the point — so a seller can choose a CDEK offer whose destination is a
 * Yandex station id, and that order cannot be created at all.
 *
 * Composed AFTER selectOrderAdaptersForConnectedCarriers — not folded into it.
 * null / empty pvzProviderKey leaves the list unchanged: legacy drafts predate
 * the column and must keep quoting through every connected carrier.
 * Never mutates `adapters`.
 */
export function narrowAdaptersToPointCarrier(
  adapters: SelectedOrderAdapter[],
  pvzProviderKey: string | null | undefined,
): SelectedOrderAdapter[] {
  const key =
    typeof pvzProviderKey === "string" ? pvzProviderKey.trim() : "";
  if (key === "") {
    return adapters;
  }
  return adapters.filter((entry) => entry.adapter.providerKey === key);
}
