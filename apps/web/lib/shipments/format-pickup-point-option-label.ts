import type { CarrierPickupPointKind } from "@oco/core/carrier-adapter/types";
import {
  parcelFitsPickupPointKind,
  type ParcelForPickupPointFit,
} from "@oco/core/carrier-adapter/parcel-fits-pickup-point-kind";

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
 * Oversized-for-postamat is also a MARK, not a hide: the parcel can change
 * after the list is loaded once, and hiding would make points vanish for a
 * reason the seller cannot see. We do NOT block the order — Yandex can cancel
 * mid-route for limit violations, and the seller keeps the choice with a
 * visible cue. Mark text stays SHORT («не влезет») — the list is two rows
 * and already carries a kind prefix and a darkstore mark; the address is what
 * distinguishes points that share a name.
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

/** Short parenthetical marks attached to the kind word / leading the option. */
function formatLeadingMarks(dark: boolean, oversized: boolean): string {
  const parts: string[] = [];
  if (dark) {
    parts.push("даркстор");
  }
  if (oversized) {
    parts.push("не влезет");
  }
  if (parts.length === 0) {
    return "";
  }
  return `(${parts.join(", ")})`;
}

function withKindPrefix(
  kindWord: string,
  name: string,
  address: string,
  dark: boolean,
  oversized: boolean,
): string {
  const base = `${name} — ${address}`;
  const nameHasWord = nameBeginsWithKindWord(name, kindWord);
  const marks = formatLeadingMarks(dark, oversized);
  if (marks) {
    if (nameHasWord) {
      return `${marks} ${base}`;
    }
    return `${kindWord} ${marks} — ${base}`;
  }
  if (nameHasWord) {
    return base;
  }
  return `${kindWord} — ${base}`;
}

export function formatPickupPointOptionLabel(
  point: {
    kind: CarrierPickupPointKind;
    name: string;
    address: string;
    isDarkStore?: boolean;
  },
  parcel?: ParcelForPickupPointFit,
): string {
  const name = point.name.trimStart();
  const base = `${name} — ${point.address}`;
  const dark = point.isDarkStore === true;
  const oversized =
    parcel != null && !parcelFitsPickupPointKind(parcel, point.kind);

  if (point.kind === "postamat") {
    return withKindPrefix("Постамат", name, point.address, dark, oversized);
  }
  if (point.kind === "warehouse") {
    return withKindPrefix("Склад", name, point.address, dark, oversized);
  }
  if (dark && point.kind === "pickup_point") {
    return withKindPrefix("ПВЗ", name, point.address, dark, oversized);
  }
  if (dark) {
    // unknown (or any other non-prefixed kind): bare word — no real kind to qualify.
    if (oversized) {
      return `(даркстор, не влезет) — ${base}`;
    }
    return `Даркстор — ${base}`;
  }
  if (oversized) {
    // Non-prefixed kind that somehow failed a future kind check — keep short.
    return `(не влезет) ${base}`;
  }
  return base;
}
