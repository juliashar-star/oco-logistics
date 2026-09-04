/**
 * WHICH CARRIERS OCO CAN CONNECT, and what each one's credential bag holds.
 *
 * THE ONE DECLARATION. Everything else derives from it: `CARRIER_CONNECT_FIELDS`
 * builds the form descriptors, `buildCarrierConnectionsView` builds the tab, the
 * connect service validates against it, and the picker asks it whether a carrier
 * can be connected at all. A second list would drift; there is not one.
 *
 * WHY THIS FILE HAS NO IMPORTS, and why that is the point. It used to live in
 * `connect-carrier-credentials.ts`, whose import chain reaches
 * `@oco/core/crypto/field-encryption` and through it `node:crypto`. The carrier
 * picker is a CLIENT component, so importing the map from there would pull a
 * Node builtin into the browser bundle — a break that `typecheck`, `test:unit`
 * and `test:db` all pass and only a real build catches (see CLAUDE.md). A leaf
 * module with zero imports cannot do that to anyone.
 *
 * MIRRORS the adapters' own assert*Credentials (assertYandexCredentials,
 * assertCdekCredentials). The adapter stays the authority: anything this spec
 * lets through is still judged by the real verifier, and a drift test proves a
 * spec-complete bag is not rejected as malformed.
 */

/**
 * One required field of a provider's credential bag.
 * `allowed` pins a closed value set where the adapter has one.
 */
export type CarrierCredentialFieldSpec = {
  name: string;
  allowed?: readonly string[];
};

export const CARRIER_CREDENTIAL_FIELDS: Readonly<
  Record<string, readonly CarrierCredentialFieldSpec[]>
> = {
  yataxi: [{ name: "platformStationId" }, { name: "token" }],
  cdek: [
    { name: "account" },
    { name: "securePassword" },
    // assertCdekCredentials accepts only "1" | "2".
    { name: "contractType", allowed: ["1", "2"] },
  ],
};

/**
 * Can OCO connect this carrier itself today?
 *
 * The ONLY признак, and it is this map's key — not a registry flag, not the
 * presence of an order adapter. `Carrier.connectableViaOco` in the registry says
 * `true` for all twelve entries including discontinued ones, so it answers
 * nothing; a key here means a credential bag, a verifier and a form all exist.
 */
export function isConnectableByOco(providerKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    CARRIER_CREDENTIAL_FIELDS,
    providerKey,
  );
}
