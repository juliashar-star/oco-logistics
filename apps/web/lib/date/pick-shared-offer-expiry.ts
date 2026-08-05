/**
 * The ONE expiry that is true for every offer on screen, or null.
 *
 * «Варианты действительны до …» is a claim about ALL displayed variants, so it
 * may only be shown when every one of them really does expire at that moment.
 * The door path can list several carriers at once (the offers route narrows to
 * a single carrier only for PVZ), and CDEK offers carry no expiry at all —
 * their `expiresAt` is always "" — so a mixed list must show nothing.
 *
 * Deliberately NO fallback: not «earliest», not «first offer wins». A guard
 * built on a fallback does not guard — picking the earliest would print a
 * Yandex deadline over CDEK cards that have no deadline.
 *
 * Returns null when the list is empty, when ANY offer has a blank or
 * unparseable expiry, or when the parsed instants are not all identical.
 * Comparison is by instant, not by raw string, so two spellings of the same
 * moment still count as shared.
 */
export function pickSharedOfferExpiry(
  offers: ReadonlyArray<{ expiresAt: string }>,
): Date | null {
  if (offers.length === 0) {
    return null;
  }

  let shared: Date | null = null;
  for (const offer of offers) {
    const trimmed = offer.expiresAt.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    if (shared === null) {
      shared = parsed;
      continue;
    }
    if (parsed.getTime() !== shared.getTime()) {
      return null;
    }
  }

  return shared;
}
