import { matchPickupPointOptionLabel } from "./match-pickup-point-option-label";

export type LabeledPickupPointOption<T extends { id: string }> = {
  point: T;
  label: string;
};

export type VisiblePickupPointOptionsResult<T extends { id: string }> = {
  /** Options to render: matches first, then a pinned selection if needed. */
  options: LabeledPickupPointOption<T>[];
  /** How many labels matched the query (never includes a non-matching pin). */
  matchCount: number;
  /**
   * True when the current selection did not match and was appended so it stays
   * among the <option>s. The pin cannot be removed: the <select> is `required`,
   * so if the selected id is absent from the options the DOM value becomes empty
   * and the browser silently blocks submission — the seller would see «Выбрано:
   * …», still hold the id in state, and be unable to create the order.
   */
  selectionPinned: boolean;
};

/**
 * Which labelled pickup-point options to render under a text filter.
 *
 * Pure and exported beside the matcher: the same choice will later be made by
 * a BUYER in a checkout widget, and nothing inside new-order-form.tsx can be
 * reused there.
 *
 * Filters with matchPickupPointOptionLabel (visible label string, not raw
 * fields). Then guarantees the currently selected entry is present: if the
 * query excludes it, it is pinned at the END (matches keep the visible rows;
 * «Выбрано: …» below the list confirms the held choice). Why it must never be
 * dropped: see selectionPinned. A selected id not in the labelled list is
 * ignored (no throw).
 *
 * Returns options together with matchCount and selectionPinned so the status
 * line does not re-decide «did it match».
 */
export function visiblePickupPointOptions<T extends { id: string }>(
  labeled: ReadonlyArray<LabeledPickupPointOption<T>>,
  query: string,
  selectedId: string | null | undefined,
): VisiblePickupPointOptionsResult<T> {
  const matched = labeled.filter(({ label }) =>
    matchPickupPointOptionLabel(label, query),
  );
  const matchCount = matched.length;

  const id = selectedId?.trim() ? selectedId : "";
  if (!id) {
    return { options: matched, matchCount, selectionPinned: false };
  }

  const selected = labeled.find(({ point }) => point.id === id);
  if (!selected) {
    return { options: matched, matchCount, selectionPinned: false };
  }

  if (matched.some(({ point }) => point.id === id)) {
    return { options: matched, matchCount, selectionPinned: false };
  }

  return {
    options: [...matched, selected],
    matchCount,
    selectionPinned: true,
  };
}

/**
 * One muted status line for an active pickup-point filter.
 * Reports MATCHES (matchCount), never rendered row count. Reads only what
 * visiblePickupPointOptions returned — does not call the matcher.
 * null when the filter is empty or the loaded list is empty.
 */
export function pickupPointFilterStatusLine(
  result: Pick<
    VisiblePickupPointOptionsResult<{ id: string }>,
    "matchCount" | "selectionPinned"
  >,
  query: string,
  totalLoaded: number,
): string | null {
  if (query.trim().length === 0 || totalLoaded === 0) {
    return null;
  }

  const { matchCount, selectionPinned } = result;

  if (matchCount > 0 && !selectionPinned) {
    return `Показано ${matchCount} из ${totalLoaded}`;
  }

  if (matchCount > 0 && selectionPinned) {
    return `Показано ${matchCount} из ${totalLoaded}; выбранный пункт тоже показан ниже`;
  }

  if (matchCount === 0 && selectionPinned) {
    return "Совпадений нет — показан только выбранный пункт";
  }

  return "Ничего не найдено по этому фильтру";
}
