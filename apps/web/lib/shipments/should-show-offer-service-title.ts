/**
 * Show the per-offer service title only when it distinguishes among options.
 * One repeated label on every card is clutter, not information.
 */
export function shouldShowOfferServiceTitle(
  offers: ReadonlyArray<{ serviceTitle: string }>,
): boolean {
  const distinct = new Set<string>();
  for (const offer of offers) {
    const title = offer.serviceTitle.trim();
    if (title.length > 0) {
      distinct.add(title);
    }
  }
  return distinct.size > 1;
}
