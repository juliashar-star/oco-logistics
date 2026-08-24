/**
 * What the seller is asked to confirm, naming BOTH numbers.
 *
 * Two numbers because a selection made with checkboxes routinely mixes drafts
 * with real orders, and the seller must know before clicking that part of what
 * they picked is staying. Saying only «удалить: 5» out of eight selected rows
 * reads as «all eight», and the surprise arrives after the irreversible step.
 *
 * PHRASED AROUND COUNT-NOUN AGREEMENT, as everywhere in this cabinet: the noun
 * is genitive plural and the number comes last, so «черновиков: 1» and
 * «черновиков: 5» are both correct. «Остальные 1 отправлений» is the shape this
 * avoids.
 *
 * The second sentence appears only when something is actually staying — on a
 * clean selection of drafts there is nothing to warn about, and a permanent
 * «не будет удалено отправлений: 0» would be noise.
 */
export function describeBulkDeleteConfirmation(
  deletableCount: number,
  keptCount: number,
): string {
  const first = `Удалить черновиков: ${deletableCount}`;
  if (keptCount <= 0) {
    return `${first}.`;
  }
  return `${first}. Не будет удалено отправлений: ${keptCount}.`;
}

/**
 * What happened, after the fact. The server returns a count and nothing else,
 * so this reports the count and nothing else.
 */
export function describeBulkDeleteResult(deletedCount: number): string {
  return `Удалено черновиков: ${deletedCount}.`;
}
