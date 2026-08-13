/**
 * Statuses after which a shipment's journey is over.
 *
 * ONE list, two consumers: the cancel route refuses on these, and the pure
 * rule that decides whether to offer a cancel control hides on the same ones.
 * It lives here rather than in either of them because a second copy would let
 * the button and the route disagree — the seller would press something the
 * server always refuses, or never see a control for something it would accept.
 */
export const TERMINAL_SHIPMENT_STATUSES = [
  "DELIVERED",
  "RETURNED",
  "CANCELED",
] as const;

export function isTerminalShipmentStatus(status: string): boolean {
  return (TERMINAL_SHIPMENT_STATUSES as readonly string[]).includes(status);
}
