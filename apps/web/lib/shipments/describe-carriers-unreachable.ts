import { describeAdaptersWithoutOffers } from "./describe-adapters-without-offers";

/**
 * Said when NO tariffs came back and the reason lies with the carriers.
 *
 * ABOUT OUR REQUEST, NOT ABOUT THE WORLD. «Тарифы не пришли» reports what
 * happened to this calculation. It deliberately does NOT say the seller has no
 * delivery options: at least one carrier never answered, so whether options
 * exist is unknown, and claiming otherwise is the one thing this outcome must
 * not do. The old branch said «Не удалось получить тарифы. Попробуйте позже.»,
 * which named nobody and asserted a retry would help — the same sentence a fault
 * in our own code produced.
 *
 * AGREEMENT HOLDS FOR ANY COUNT, on both halves. «Тарифы не пришли» is plural
 * with no numeral before it, so it is correct whether one carrier was asked or
 * five. The half after the colon comes from describeAdaptersWithoutOffers, which
 * already chooses its verb by count — «не отвечает» against «не отвечают» — and
 * keeps every carrier name in the nominative so nothing has to bend around a
 * gender the real names do not share.
 *
 * THE DETAIL IS NOT REBUILT HERE. The per-carrier half is the same function the
 * mixed branch uses, so a carrier is described identically whether it failed
 * alone or beside a carrier that succeeded. A mixed set is reported as mixed:
 * «не отвечает» and «не возит по этому направлению» can stand in one sentence,
 * which is what makes this outcome honest about a set it cannot summarise.
 *
 * Returns null when there is nothing to name — the caller then keeps its own
 * generic wording rather than printing a bare lead-in.
 */
export const CARRIERS_UNREACHABLE_LEAD_RU = "Тарифы не пришли";

export function describeCarriersUnreachable(adapters: unknown): string | null {
  const detail = describeAdaptersWithoutOffers(adapters);
  if (detail === null) {
    return null;
  }
  // THE DETAIL IS PASSED THROUGH UNTOUCHED, and lower-casing its first letter
  // to sit after the colon would be a bug, not a polish: it begins with a
  // carrier's real name, so «СДЭК» would become «сДЭК». Only the generic
  // fallback «Один из перевозчиков» carries a capital that a colon does not
  // call for, and a slightly formal capital is cheaper than damaging a name.
  return `${CARRIERS_UNREACHABLE_LEAD_RU}: ${detail}.`;
}
