/**
 * Earliest usable expiresAt among offers.
 * Returns null when the list is empty or no expiry parses.
 */
export function pickEarliestOfferExpiry(
  offers: ReadonlyArray<{ expiresAt: string }>,
): Date | null {
  let earliest: Date | null = null;
  for (const offer of offers) {
    const trimmed = offer.expiresAt.trim();
    if (!trimmed) {
      continue;
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      continue;
    }
    if (earliest === null || parsed.getTime() < earliest.getTime()) {
      earliest = parsed;
    }
  }
  return earliest;
}
