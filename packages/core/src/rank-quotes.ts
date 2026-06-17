import type { DeliveryQuote } from "@oco/apiship";

export type RankTag = "fast" | "cheap" | "optimal";

export type RankedQuote = DeliveryQuote & {
  tags: RankTag[];
};

/** Простые правила MVP: дёшево / быстро / оптимально (без Carrier Score пока). */
export function rankQuotes(quotes: DeliveryQuote[]): RankedQuote[] {
  if (quotes.length === 0) return [];

  const cheapest = quotes.reduce((a, b) =>
    a.deliveryCostRub < b.deliveryCostRub ? a : b,
  );
  const fastest = quotes.reduce((a, b) =>
    a.deliveryDaysMin < b.deliveryDaysMin ? a : b,
  );

  const optimal = quotes.reduce((best, current) => {
    const bestScore = scoreOption(best);
    const currentScore = scoreOption(current);
    return currentScore > bestScore ? current : best;
  });

  const key = (q: DeliveryQuote) =>
    `${q.providerKey}:${q.tariffId}:${q.deliveryMode}`;

  const tagMap = new Map<string, Set<RankTag>>();

  const addTag = (q: DeliveryQuote, tag: RankTag) => {
    const k = key(q);
    if (!tagMap.has(k)) tagMap.set(k, new Set());
    tagMap.get(k)!.add(tag);
  };

  addTag(cheapest, "cheap");
  addTag(fastest, "fast");
  addTag(optimal, "optimal");

  return quotes.map((quote) => ({
    ...quote,
    tags: Array.from(tagMap.get(key(quote)) ?? []),
  }));
}

function scoreOption(quote: DeliveryQuote): number {
  const maxCost = 5000;
  const maxDays = 14;
  const costScore = 1 - Math.min(quote.deliveryCostRub, maxCost) / maxCost;
  const daysScore = 1 - Math.min(quote.deliveryDaysMin, maxDays) / maxDays;
  return costScore * 0.5 + daysScore * 0.5;
}
