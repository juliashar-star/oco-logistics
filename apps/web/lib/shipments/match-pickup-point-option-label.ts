/**
 * Match a pickup-point option label against a free-text query.
 *
 * Pure and exported for reuse outside the seller form: the same choice will
 * later be made by a BUYER in a checkout widget on the seller's site, and
 * nothing that lives inside new-order-form.tsx can be reused there.
 *
 * Matches THE STRING THE USER SEES — an already-formatted label from
 * formatPickupPointOptionLabel — not raw name/address fields. The caller
 * formats once and passes the label in; this function does not call the
 * formatter.
 *
 * Tokens are whitespace-split; every token must appear in the label
 * (order-independent). Matching is case-insensitive; «ё» and «е» are the
 * same letter. Empty / whitespace-only query matches everything.
 */
export function matchPickupPointOptionLabel(
  formattedLabel: string,
  query: string,
): boolean {
  const tokens = normalizeForMatch(query)
    .split(/\s+/)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return true;
  }
  const haystack = normalizeForMatch(formattedLabel);
  return tokens.every((token) => haystack.includes(token));
}

function normalizeForMatch(value: string): string {
  return value.toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
}
