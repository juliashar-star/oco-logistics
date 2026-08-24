export type DeletableSelectionRow = {
  id: string;
  status: string;
  /** DTO field derived from providerOrderId — see ShipmentListItemDto. */
  hasCarrierOrder: boolean;
};

export type SelectionSplit = {
  /** Ids the server's guard will actually delete. */
  deletable: string[];
  /** Ids that were selected and will survive. */
  kept: string[];
};

/**
 * Splits a selection into «drafts that will go» and «everything else».
 *
 * MIRRORS THE SERVER GUARD, does not replace it. The delete route decides with
 * `status DRAFT + providerOrderId null`; the browser cannot see providerOrderId
 * — it never crosses the boundary — but the list DTO already ships
 * `hasCarrierOrder`, which is derived from exactly that column. So the two ask
 * the same question of the same two facts.
 *
 * This exists ONLY so the confirmation can name both numbers before the seller
 * commits. If it ever disagreed with the server the server still wins: the
 * count that comes back is what happened, and the panel reports that count.
 */
export function splitSelectionForDelete(
  rows: readonly DeletableSelectionRow[],
  selectedIds: ReadonlySet<string>,
): SelectionSplit {
  const deletable: string[] = [];
  const kept: string[] = [];
  for (const row of rows) {
    if (!selectedIds.has(row.id)) {
      continue;
    }
    if (row.status === "DRAFT" && !row.hasCarrierOrder) {
      deletable.push(row.id);
    } else {
      kept.push(row.id);
    }
  }
  return { deletable, kept };
}
