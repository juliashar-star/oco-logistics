import type { CarrierPickupPointKind } from "@oco/core/carrier-adapter/types";

/**
 * Seller-facing <option> label for a pickup point.
 * Постамат / склад get an explicit prefix; plain pickup_point (and unknown)
 * keep «name — address» unchanged when not a darkstore.
 *
 * The name is normalised once (leading whitespace trimmed) at the top of the
 * formatter so the prefix decision and the rendered output cannot disagree.
 *
 * Kind prefix is added ONLY when the point's name does not already begin with
 * that same word (case-insensitive, WORD at START only — «Пункт у постамата»
 * still gets the prefix). Why: on production Moscow (30.07) all 549 terminals
 * are named «Постамат Яндекс Маркет» and differ only by ADDRESS. A <select>
 * truncates from the right, so a doubled «Постамат —» eats ten characters from
 * the only distinguishing part of the string. The prefix remains essential for
 * third-party lockers (sandbox «Лучше чем МП») whose name gives no kind clue.
 *
 * Darkstore is a MARK, not a kind: Yandex docs only say «Признак даркстора»
 * and nothing about whether a buyer may collect there. Trade meaning is a
 * warehouse closed to walk-in shoppers, but some darkstores also serve as
 * pickup points — so we must not imply «buyer cannot collect».
 *
 * The mark leads — never trails — because a plain <select> truncates long
 * options by control width. When the kind word already opens the name, the
 * mark stands alone and leading («(даркстор) <name> — <address>»): a bare
 * leading mark survives truncation and does not invent a second kind word,
 * while «Постамат (даркстор) —» would reintroduce the doubling this slice
 * removes. When the name does not start with the kind word, today's form is
 * kept («Постамат (даркстор) — …»). No darkstore has been observed on either
 * contour (0 of 4395 points: tst 809 + prod Moscow 3586), so the darkstore
 * branch is a guard, not a case we are designing for.
 *
 * OCO's own copy uses the short trio «Постамат» / «Склад» / «ПВЗ»; carrier
 * point names are left untouched. pickup_point gets «ПВЗ» only when marked
 * (the mark needs a word to qualify); non-darkstore pickup_point stays
 * unprefixed.
 */
function nameBeginsWithKindWord(name: string, word: string): boolean {
  const nameLower = name.toLocaleLowerCase("ru-RU");
  const wordLower = word.toLocaleLowerCase("ru-RU");
  if (!nameLower.startsWith(wordLower)) {
    return false;
  }
  if (nameLower.length === wordLower.length) {
    return true;
  }
  // WORD boundary: next character must not be a letter («Постаматный» ≠ «Постамат»).
  return !/\p{L}/u.test(nameLower.charAt(wordLower.length));
}

function withKindPrefix(
  kindWord: string,
  name: string,
  address: string,
  dark: boolean,
): string {
  const base = `${name} — ${address}`;
  const nameHasWord = nameBeginsWithKindWord(name, kindWord);
  if (dark) {
    if (nameHasWord) {
      return `(даркстор) ${base}`;
    }
    return `${kindWord} (даркстор) — ${base}`;
  }
  if (nameHasWord) {
    return base;
  }
  return `${kindWord} — ${base}`;
}

export function formatPickupPointOptionLabel(point: {
  kind: CarrierPickupPointKind;
  name: string;
  address: string;
  isDarkStore?: boolean;
  /** Masked seller-facing carrier name from the DTO; empty → no prefix. */
  carrierName?: string;
}): string {
  const name = point.name.trimStart();
  const base = `${name} — ${point.address}`;
  const dark = point.isDarkStore === true;

  let existingLabel: string;
  if (point.kind === "postamat") {
    existingLabel = withKindPrefix("Постамат", name, point.address, dark);
  } else if (point.kind === "warehouse") {
    existingLabel = withKindPrefix("Склад", name, point.address, dark);
  } else if (dark && point.kind === "pickup_point") {
    existingLabel = withKindPrefix("ПВЗ", name, point.address, dark);
  } else if (dark) {
    // unknown (or any other non-prefixed kind): bare word — no real kind to qualify.
    existingLabel = `Даркстор — ${base}`;
  } else {
    existingLabel = base;
  }

  // Same « · » separator as the offer card (carrierName · service).
  const carrierName =
    typeof point.carrierName === "string" ? point.carrierName.trim() : "";
  if (carrierName.length > 0) {
    return `${carrierName} · ${existingLabel}`;
  }
  return existingLabel;
}
