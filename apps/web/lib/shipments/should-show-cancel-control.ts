import { isTerminalShipmentStatus } from "./terminal-shipment-statuses";

/**
 * Whether the cabinet should offer a «cancel» control for this shipment.
 *
 * IT MIRRORS THE ROUTE, and nothing else. POST /api/shipments/[id]/cancel
 * refuses on exactly two conditions this function can see:
 *   - no carrier order  → 400 «Заказ ещё не создан у перевозчика»
 *   - terminal status   → 409 «Заказ уже завершён»
 * Anything the route would accept, this shows. Anything it always refuses,
 * this hides — a control whose only outcome is an error is worse than no
 * control, and a row the route would accept must not be silently unactionable.
 *
 * THE ROUTE'S THIRD PRECONDITION IS DELIBERATELY NOT MIRRORED. It refuses with
 * 409 when `resolveOrderAdapterStrict` cannot identify the carrier, and the
 * browser cannot evaluate that: telling a known adapter key from an unknown one
 * needs the registry, which never crosses into the client (see offer-dto.ts —
 * «the browser must not know which adapter keys support what»). The one
 * client-reachable proxy, ORDER_ADAPTER_SELLER_TITLES, is not safe as one: the
 * no-drift test only checks registry → titles, so an extra key there would read
 * as «known» while the route returns null. So the control stays VISIBLE for an
 * unresolvable adapter and the route's own message explains the refusal. That
 * message exists for exactly this case.
 *
 * NOT PART OF shipmentFooterAction, on purpose. Those branches are mutually
 * exclusive — a shipment gets delete, or anonymize, or nothing — and cancel is
 * orthogonal to all three: a CREATED shipment carrying recipient data can be
 * both cancellable AND anonymisable, and folding cancel into that enum would
 * make one displace the other. Two independent questions, two functions.
 */
export function shouldShowCancelControl(shipment: {
  status: string;
  hasCarrierOrder: boolean;
}): boolean {
  if (!shipment.hasCarrierOrder) {
    return false;
  }
  return !isTerminalShipmentStatus(shipment.status);
}
