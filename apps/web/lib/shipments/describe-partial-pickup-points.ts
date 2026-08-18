/**
 * WHY: when some connected carriers return points and others do not, the seller
 * still sees a non-empty list and has no red error. Without a status-only
 * caution they cannot tell that part of the network is missing. Naming comes
 * from server-resolved carrierName — never providerKey (masking).
 *
 * Reacts only to failed / city_not_resolved / no_adapter. status "ok" with
 * zero points is an honest empty network for that city — not a failure.
 */

type PartialCarrierInput = {
  status?: unknown;
  carrierName?: unknown;
};

/** Always nominative — see phraseForGroup: nothing declines a carrier name now. */
const EMPTY_NAME_FALLBACK = "один из перевозчиков";

const STATUS_ORDER = ["failed", "city_not_resolved", "no_adapter"] as const;

type PartialStatus = (typeof STATUS_ORDER)[number];

function isPartialStatus(status: unknown): status is PartialStatus {
  return (
    status === "failed" ||
    status === "city_not_resolved" ||
    status === "no_adapter"
  );
}

function displayName(carrier: PartialCarrierInput): string {
  const name =
    typeof carrier.carrierName === "string" ? carrier.carrierName.trim() : "";
  return name.length > 0 ? name : EMPTY_NAME_FALLBACK;
}

function joinNames(names: string[]): string {
  return names.join(", ");
}

/**
 * A CARRIER NAME IS NEVER DECLINED, and the verbs are in the PRESENT TENSE for
 * that exact reason.
 *
 * The names used to be masked («Перевозчик №N»), a masculine noun we could bend
 * safely: an earlier version turned it into «Перевозчика №N» after «Для», and
 * the past tense «не нашёл» agreed with its gender. Real names break both
 * tricks. «СДЭК» does not decline at all, «Яндекс Доставка» is feminine and
 * would need «Яндекс Доставки», «Dostavista» is Latin script — no rule fits all
 * three, and a wrong case or a wrong gender is a visible mistake in a sentence
 * a seller reads.
 *
 * Russian present-tense verbs do NOT agree with gender — «не отвечает» is
 * correct for «СДЭК», «Яндекс Доставка» and «Dostavista» alike — so the tense
 * carries the whole problem away. Number agreement stays: we always know how
 * many carriers are in the group.
 *
 * The «Для X …» shape is gone with the genitive that required it; every group
 * now starts with the name in the nominative and continues after an em dash,
 * the same shape describeAdaptersWithoutOffers already uses.
 */
function phraseForGroup(status: PartialStatus, names: string[]): string {
  const joined = joinNames(names);
  const many = names.length > 1;
  switch (status) {
    case "failed":
      // Present tense: «не отвечает» / «не отвечают» — no gender agreement.
      return `${joined} — ${many ? "не отвечают" : "не отвечает"}`;
    case "city_not_resolved":
      // Present tense: «не находит» works for any gender and any script.
      return `${joined} — ${many ? "не находят" : "не находит"} этот город`;
    case "no_adapter":
      // Name first, nominative, then the em dash — nothing to decline.
      return `${joined} — список пунктов пока недоступен`;
  }
}

/** Capitalise only the first character of the whole notice — not after «; ». */
function capitaliseFirst(text: string): string {
  if (text.length === 0) {
    return text;
  }
  return text.charAt(0).toLocaleUpperCase("ru-RU") + text.slice(1);
}

export function describePartialPickupPoints(
  carriers: unknown,
): string | null {
  if (!Array.isArray(carriers) || carriers.length === 0) {
    return null;
  }

  const groups = new Map<PartialStatus, string[]>();
  for (const status of STATUS_ORDER) {
    groups.set(status, []);
  }

  for (const entry of carriers as PartialCarrierInput[]) {
    if (!isPartialStatus(entry?.status)) {
      continue;
    }
    groups.get(entry.status)!.push(displayName(entry));
  }

  const parts: string[] = [];
  for (const status of STATUS_ORDER) {
    const names = groups.get(status)!;
    if (names.length === 0) {
      continue;
    }
    parts.push(phraseForGroup(status, names));
  }

  if (parts.length === 0) {
    return null;
  }

  return capitaliseFirst(parts.join("; "));
}
