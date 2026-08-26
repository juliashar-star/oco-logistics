/**
 * WHY: when one adapter answers and another does not, the seller sees a shorter
 * list of cards and no error at all. The fan-out already knows which adapter
 * produced nothing and why — the information existed and simply never left the
 * server. Without a line beside the list, a carrier that was asked and failed is
 * indistinguishable from one that was never connected.
 *
 * SHAPE COPIED FROM describePartialPickupPoints, PAYLOAD DELIBERATELY NOT.
 * That module receives rows that also carry `providerKey`, and the pickup-points
 * DTO ships it to the browser. Here the input carries only what the offer card
 * already shows — a masked carrier name and a registry service title — and no
 * key of either kind.
 *
 * WHY A PAIR AND NOT ONE NAME. Measured in the registry: three yataxi entries
 * share one providerKey, so «Перевозчик №1» cannot say WHICH service is missing;
 * and `yataxi:next_day` and `cdek:delivery` carry the same title «Доставка по
 * России», so the title cannot say WHICH carrier. Only «имя · услуга» is unique
 * across all four entries — the same construction the card heading uses.
 *
 * Reacts to four statuses in three groups. `ok` is ignored on purpose: an
 * adapter that answered successfully with nothing to sell is not a failure the
 * seller needs a sentence about, exactly as `ok` with zero points is ignored in
 * the pickup-points notice.
 */

type AdapterWithoutOffersInput = {
  carrierName?: unknown;
  serviceTitle?: unknown;
  status?: unknown;
};

/** Used when the server could name neither half of the pair. */
const EMPTY_NAME_FALLBACK = "один из перевозчиков";

/**
 * Fixed order: what the seller can fix right here, what the route cannot serve,
 * what broke, what the seller can fix in settings.
 *
 * `parcel_too_large` comes FIRST because it is the only one the seller can act
 * on without leaving the parcel fields — the numbers that caused it are on the
 * same screen.
 */
const STATUS_ORDER = [
  "parcel_too_large",
  "no_delivery_options",
  "unreachable",
  "auth_failed",
] as const;

type NoticeGroup = (typeof STATUS_ORDER)[number];

/**
 * `timed_out` and `failed` share one group: to the seller they are the same
 * event — the carrier did not answer — and the difference between a timeout and
 * a thrown error is ours to read in the log, not theirs to act on.
 */
function groupOf(status: unknown): NoticeGroup | null {
  if (status === "parcel_too_large") {
    return "parcel_too_large";
  }
  if (status === "no_delivery_options") {
    return "no_delivery_options";
  }
  if (status === "timed_out" || status === "failed") {
    return "unreachable";
  }
  if (status === "auth_failed") {
    return "auth_failed";
  }
  return null;
}

/** «Перевозчик №2 · Доставка по России»; falls back when either half is blank. */
function displayName(entry: AdapterWithoutOffersInput): string {
  const carrier =
    typeof entry.carrierName === "string" ? entry.carrierName.trim() : "";
  const service =
    typeof entry.serviceTitle === "string" ? entry.serviceTitle.trim() : "";
  if (carrier === "" && service === "") {
    return EMPTY_NAME_FALLBACK;
  }
  if (service === "") {
    return carrier;
  }
  if (carrier === "") {
    return service;
  }
  return `${carrier} · ${service}`;
}

function joinNames(names: string[]): string {
  return names.join(", ");
}

/**
 * Wording rules: a status says WHAT HAPPENED, never how we feel about it, and it
 * is phrased so the agreement is correct for any count (the verb is chosen, not
 * the noun bent around a number).
 *
 * PRESENT TENSE, AND THE NAME IS NEVER DECLINED. Since the cabinet shows real
 * carrier names, the past tense no longer works: «не ответил» agrees with
 * gender, and «СДЭК», «Яндекс Доставка» and «Dostavista» do not share one.
 * Russian present-tense verbs carry no gender, so «не отвечает» is correct for
 * all three. The name always stands first, in the nominative, before the em
 * dash — nothing after it has to bend.
 */
function phraseForGroup(group: NoticeGroup, names: string[]): string {
  const joined = joinNames(names);
  const many = names.length > 1;
  switch (group) {
    case "parcel_too_large":
      // ABOUT THE PARCEL, not the route. Before this group existed, a service
      // that refused an oversized parcel was reported as «не возит по этому
      // направлению» — a sentence about geography for a decision taken about
      // size, and one a seller could not act on: the direction was fine.
      return `${joined} — ${many ? "не принимают" : "не принимает"} посылку такого веса или размера`;
    case "no_delivery_options":
      return `${joined} — ${many ? "не возят" : "не возит"} по этому направлению`;
    case "unreachable":
      // Was «не ответил» — past tense agrees with gender, real names differ.
      return `${joined} — ${many ? "не отвечают" : "не отвечает"}, попробуйте рассчитать ещё раз`;
    case "auth_failed":
      return `${joined} — проверьте подключение в настройках`;
  }
}

/** Capitalise the whole notice once — not each group after «; ». */
function capitaliseFirst(text: string): string {
  if (text.length === 0) {
    return text;
  }
  return text.charAt(0).toLocaleUpperCase("ru-RU") + text.slice(1);
}

/**
 * The line shown beside a non-empty offer list, or null when there is nothing to
 * say. Pure so the decision is testable: the surrounding component needs React
 * and a fetch to run, and a rule nothing can exercise is a rule nobody watches.
 */
export function describeAdaptersWithoutOffers(
  adapters: unknown,
): string | null {
  if (!Array.isArray(adapters) || adapters.length === 0) {
    return null;
  }

  const groups = new Map<NoticeGroup, string[]>();
  for (const group of STATUS_ORDER) {
    groups.set(group, []);
  }

  for (const entry of adapters as AdapterWithoutOffersInput[]) {
    const group = groupOf(entry?.status);
    if (group === null) {
      continue;
    }
    groups.get(group)!.push(displayName(entry));
  }

  const parts: string[] = [];
  for (const group of STATUS_ORDER) {
    const names = groups.get(group)!;
    if (names.length === 0) {
      continue;
    }
    parts.push(phraseForGroup(group, names));
  }

  if (parts.length === 0) {
    return null;
  }

  return capitaliseFirst(parts.join("; "));
}
