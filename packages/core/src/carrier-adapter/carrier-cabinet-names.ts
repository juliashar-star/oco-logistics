import { CARRIER_REGISTRY } from "../carrier-picker/registry";

/**
 * Shown when a provider key has no real name in the registry.
 *
 * NEVER DERIVED FROM THE KEY. `Carrier.name` in the database is literally
 * `providerKey.toUpperCase()` («CSE», «DOSTAVISTA»), which is a key wearing
 * capital letters, not a name — putting that on screen is the defect this
 * module removes, not a fallback it may use.
 */
export const CARRIER_CABINET_NAME_FALLBACK = "Другой перевозчик";

const UNKNOWN_CARRIER_LOG_MARKER = "[carrierCabinetName] NO_REGISTRY_NAME";

/**
 * The carrier's REAL name, for the seller's own cabinet.
 *
 * DECIDED 18.08: inside the cabinet a seller sees who actually carries their
 * parcel. They connected that carrier themselves, with their own credentials —
 * hiding the name from them buys nothing and costs them the ability to act on
 * what they read. Masking («Перевозчик №1») stays where it is a secrecy
 * measure: the public site.
 *
 * THE KEY STILL DOES NOT DECIDE ANYTHING IN THE BROWSER. This resolves on the
 * server and the cabinet ships the finished string; what changed is what the
 * key resolves INTO, not where it is resolved.
 *
 * An unknown key gets the neutral string and a log line — an invented name
 * would be a claim about a carrier we cannot make.
 */
export function carrierCabinetName(providerKey: string): string {
  const key = providerKey.trim();
  if (key === "") {
    return CARRIER_CABINET_NAME_FALLBACK;
  }
  const entry = CARRIER_REGISTRY.find(
    (carrier) => carrier.providerKey === key,
  );
  if (entry === undefined || entry.displayName.trim() === "") {
    console.error(UNKNOWN_CARRIER_LOG_MARKER, JSON.stringify({ providerKey: key }));
    return CARRIER_CABINET_NAME_FALLBACK;
  }
  return entry.displayName;
}
