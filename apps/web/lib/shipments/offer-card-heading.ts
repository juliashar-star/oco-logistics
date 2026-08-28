import { shouldShowOfferServiceTitle } from "./should-show-offer-service-title";

type HeadingOffer = {
  carrierName: string;
  serviceName?: string;
  serviceTitle: string;
};

/**
 * The small grey line at the top of an offer card: «СДЭК · Посылка склад-склад».
 *
 * TWO SOURCES FOR ONE SLOT, and which one wins is the whole rule.
 * `serviceName` is the carrier's OWN name for this particular tariff, and it
 * arrives per offer from an open set discovered per route and per contract —
 * only CDEK sends it. `serviceTitle` is our curated registry title for the
 * adapter, one string for every offer of that service. The carrier's own word
 * wins whenever it exists, because it distinguishes rows the registry title
 * cannot: four CDEK tariffs on one screen all carry the title «Доставка по
 * России» while their `serviceName`s differ.
 *
 * THE REGISTRY TITLE IS SUPPRESSED WHEN IT REPEATS. `shouldShowOfferServiceTitle`
 * returns false when every offer on screen shares one title, and then the
 * heading is the carrier name alone — one identical label on every card is
 * clutter, not information. Note this is a property of the WHOLE list, so the
 * list has to be passed in; a card cannot decide it alone.
 *
 * THE KNOWN COLLISION, which this function does not resolve and must not hide:
 * `yataxi:next_day` and `cdek:delivery` carry the SAME title, «Доставка по
 * России» (order-adapter-seller-titles.ts:9 and :14, flagged at
 * offer-dto.ts:58). When both carriers quote, the titles differ across the list
 * so the suppression does not fire, and the two headings separate only by the
 * carrier name — «Яндекс Доставка · Доставка по России» against «СДЭК ·
 * Доставка по России». In practice CDEK almost always sends `serviceName` and
 * displaces its half, but that is the carrier's habit, not a guarantee, and
 * nothing here enforces it. Fixing the collision means changing the titles, not
 * this composition.
 *
 * Pure so the rule is testable: the card needs React to render, and a rule
 * nothing can exercise is a rule nobody is watching.
 */
export function offerCardHeading(
  offer: HeadingOffer,
  offers: ReadonlyArray<{ serviceTitle: string }>,
): string {
  const service = offer.serviceName
    ? offer.serviceName
    : shouldShowOfferServiceTitle(offers)
      ? offer.serviceTitle
      : "";
  return service ? `${offer.carrierName} · ${service}` : offer.carrierName;
}
