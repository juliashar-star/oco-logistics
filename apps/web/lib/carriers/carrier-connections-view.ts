import { CARRIER_REGISTRY } from "@oco/core";

import type { CarrierConnectField } from "./carrier-connect-fields";

/**
 * What the «Подключение» tab needs, per carrier.
 *
 * `displayName` is the carrier's REAL name here, by decision: this tab is where
 * a seller connects their own account, so «Перевозчик №1» would be unusable.
 * The masking convention stays in force everywhere else (offer cards, the
 * shipments list) — do not read this as a general relaxation.
 */
export type CarrierConnectionView = {
  providerKey: string;
  displayName: string;
  isConnected: boolean;
  fields: readonly CarrierConnectField[];
};

/**
 * PURE. Takes ONLY the field descriptors and the connected provider keys, so it
 * is structurally incapable of reaching a credential: nothing decrypted, and no
 * Prisma client, is in scope.
 *
 * Order follows the descriptor map, which follows CARRIER_CREDENTIAL_FIELDS —
 * today Yandex then CDEK, the order the tab already tells sellers to use.
 *
 * A descriptor key with no registry entry throws: there is no honest plain name
 * to show, and falling back to the providerKey would send an internal key to the
 * browser, which CLAUDE.md forbids.
 */
export function buildCarrierConnectionsView(
  descriptors: Readonly<Record<string, readonly CarrierConnectField[]>>,
  connectedProviderKeys: readonly string[],
): CarrierConnectionView[] {
  const connected = new Set(connectedProviderKeys);

  return Object.entries(descriptors).map(([providerKey, fields]) => {
    const displayName = CARRIER_REGISTRY.find(
      (carrier) => carrier.providerKey === providerKey,
    )?.displayName;

    if (displayName === undefined) {
      throw new Error(
        `buildCarrierConnectionsView: no registry display name for "${providerKey}"`,
      );
    }

    return {
      providerKey,
      displayName,
      isConnected: connected.has(providerKey),
      fields,
    };
  });
}
