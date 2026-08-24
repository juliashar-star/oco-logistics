/**
 * What the single export button in the toolbar says right now.
 *
 * ONE BUTTON, TWO MEANINGS, AND THE LABEL IS WHERE IT SAYS SO. With nothing
 * ticked the button exports what the filters describe; with rows ticked it
 * exports exactly those rows. Two buttons side by side read as a duplicate —
 * measured on the real screen — but a button that silently changes what it does
 * is worse than a duplicate. Naming the selection in the label, next to a count
 * the seller can also read off the line above, means the change of meaning is
 * announced rather than assumed.
 *
 * The number comes last after a genitive plural, as everywhere in this cabinet,
 * so «Экспорт выбранных: 1» and «Экспорт выбранных: 5» are both correct.
 */
export function exportActionLabel(selectedCount: number): string {
  if (selectedCount <= 0) {
    return "Экспорт CSV";
  }
  return `Экспорт выбранных: ${selectedCount}`;
}
