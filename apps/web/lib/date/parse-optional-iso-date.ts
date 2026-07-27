/** Parse a carrier ISO timestamp; null for blank or unparseable input. */
export function parseOptionalIsoDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
