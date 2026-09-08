import type { CarrierConnectField } from "./carrier-connect-fields";
import { describeCarrierFormGap } from "./describe-carrier-form-gap";

/**
 * Is this carrier's form ready to submit? PURE — descriptors, the current
 * values, and whether the carrier is already connected. The component only
 * calls it, so "when does the button light up" is a decision a millisecond-fast
 * test can reach.
 *
 * DERIVED, AND THAT IS THE POINT. The rules — what counts as a sendable value,
 * and how the two connection states differ — moved WHOLE into
 * `describeCarrierFormGap`, which names the gap instead of hiding it in a
 * boolean. This function keeps no copy of them. A second implementation would
 * let the button light up while the notice beside it still lists a missing
 * field, and that pair of states is worse than the silent grey button the
 * notice exists to fix.
 *
 * The signature and the return type are unchanged: twelve tests compare the
 * result against boolean literals under `node:assert/strict`, and they stay
 * green without a single edit. They now also guard the derivation — a gap
 * misclassified at the ready/not-ready boundary fails them.
 *
 * `values` holds only what the seller typed into a field they had focused (the
 * panel gates writes through shouldAcceptFieldValue). The POST body MUST read
 * that SAME object — never an input's DOM value, never a ref. Measured:
 * Chrome's autofill can put the seller's own site password into an input and
 * fire a change event, so anything read from the DOM may not be theirs to send.
 *
 * The UI can mark every field «сохранён» from `isConnected` alone:
 * connectCarrierCredentials never stores a partial bag.
 */
export function isCarrierFormComplete(
  fields: readonly CarrierConnectField[],
  values: Readonly<Record<string, string>>,
  isConnected: boolean,
): boolean {
  return describeCarrierFormGap(fields, values, isConnected).kind === "ready";
}
