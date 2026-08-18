/**
 * One row of the dashboard's carrier group-by, before the two carrier columns
 * are reconciled into a single key.
 */
export type CarrierTallyRow = {
  providerKey: string | null;
  carrierId: string | null;
  count: number;
};

export type CarrierTally = {
  /** The provider key itself, NOT a display name — the caller resolves it. */
  providerKey: string;
  count: number;
};

/**
 * How many shipments each carrier actually carried, counted the SAME WAY the
 * shipments list identifies a carrier.
 *
 * WHY THIS EXISTS. A shipment names its carrier in one of two columns depending
 * on which path created it: the direct path writes `providerKey`, the older
 * APIShip path wrote only a `carrierId` pointing at the legacy carrier table.
 * The dashboard used to group by `carrierId` alone, so it could only ever see
 * the older path — a carrier the seller connected themselves was invisible on
 * their own dashboard no matter how many parcels went through it. The list
 * already resolves `providerKey ?? carrier.apishipCode` (see
 * `toShipmentListItem`); this applies the identical rule, so the cabinet has ONE
 * definition of «which carrier is this», not one per screen.
 *
 * WHY ONE GROUPED QUERY AND NOT TWO. Counting the two columns separately and
 * adding the results is correct only while no row carries both. Today none does,
 * but the moment one did — a backfill, a path that learns to write both — every
 * such row would be counted twice, and a double-count is invisible: the panel
 * would just show numbers that are quietly too big. Grouping by BOTH columns at
 * once and reconciling each group to a single key here means a row contributes
 * exactly once by construction, whatever the columns hold.
 *
 * A row that resolves to no key at all is NOT counted. It has no carrier — an
 * order that never reached one — and there is nobody to attribute it to;
 * inventing a bucket for it would put a fictional carrier on the panel.
 *
 * The result is sorted by count, descending. Equal counts fall back to the key
 * so the order is stable: without a tiebreak the panel would reshuffle between
 * loads on whatever order the database happened to return.
 */
export function tallyShipmentsByCarrier(
  rows: readonly CarrierTallyRow[],
  apishipCodeByCarrierId: ReadonlyMap<string, string>,
): CarrierTally[] {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const legacyKey =
      row.carrierId != null ? apishipCodeByCarrierId.get(row.carrierId) : undefined;
    // Same precedence as the list: the row's own key wins, the legacy table is
    // the fallback for rows created before that column existed.
    const key = (row.providerKey ?? legacyKey ?? "").trim();
    if (key === "") {
      continue;
    }
    totals.set(key, (totals.get(key) ?? 0) + row.count);
  }

  return [...totals]
    .map(([providerKey, count]) => ({ providerKey, count }))
    .sort((a, b) =>
      b.count !== a.count ? b.count - a.count : a.providerKey < b.providerKey ? -1 : 1,
    );
}
