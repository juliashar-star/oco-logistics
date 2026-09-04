import { CARRIER_CREDENTIAL_FIELDS } from "./carrier-credential-fields";

/**
 * Which carrier card, if any, the settings page was asked to scroll to.
 *
 * WHY A FUNCTION AND NOT AN `if` IN THE PAGE. Four separate ways to answer
 * «nothing», and the one that matters is the one that disappears in markup: a
 * key that is not ours must be ignored SILENTLY — no scroll, no error, no
 * echo. `?carrier=` comes from the address bar, so whatever a stranger types
 * there reaches this code, and a value that reached the DOM as an element id
 * would be an arbitrary string from a URL rendered into the page.
 *
 * THE WHITE LIST IS THE ONE ПРИЗНАК, derived, not restated: a carrier is
 * addressable exactly when OCO can connect it, because the connection tab shows
 * a card for exactly those. Adding a carrier to the credential map makes its
 * card addressable in the same commit, with nothing else to remember.
 *
 * The leaf import keeps this usable from both sides: the settings page resolves
 * it on the server, the panel builds ids from it in the browser, and the module
 * it reads imports nothing at all.
 */

/** The DOM id of one carrier's card. One definition, used to write and to find. */
export function carrierSectionId(providerKey: string): string {
  return `carrier-card-${providerKey}`;
}

/**
 * @param raw the `carrier` query parameter, as it arrives — any shape.
 * @returns the providerKey to scroll to, or null when there is nothing to do.
 */
export function resolveCarrierAnchor(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const key = raw.trim();
  if (key === "") {
    return null;
  }
  // OWN keys only. Unguarded, «constructor» and «__proto__» come back as
  // members of the map and would resolve to a card id for a carrier that does
  // not exist.
  return Object.prototype.hasOwnProperty.call(CARRIER_CREDENTIAL_FIELDS, key)
    ? key
    : null;
}

/**
 * Should the panel scroll, given what the URL asked for and what actually
 * loaded?
 *
 * A valid key can still name a card that is not on this list — the tab renders
 * one card per carrier the connect service handles, and that set could narrow.
 * Scrolling to an element that is not there does nothing visible but reads as a
 * bug when it silently fails; deciding here says out loud that we checked.
 */
export function carrierAnchorTarget(
  anchor: string | null,
  availableProviderKeys: readonly string[],
): string | null {
  if (anchor === null) {
    return null;
  }
  return availableProviderKeys.includes(anchor) ? anchor : null;
}
