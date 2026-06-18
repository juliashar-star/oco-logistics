import type { DeliveryQuote } from "@oco/apiship";
import {
  DEFAULT_DECISION_WEIGHTS,
  normalizeDecisionWeights,
  type DecisionWeights,
} from "./decision-weights";

export type RankTag = "fast" | "cheap" | "optimal";

export type RankedQuote = DeliveryQuote & {
  tags: RankTag[];
};

export type QuoteForRanking = DeliveryQuote & {
  /** Carrier Score 0..100; если нет данных — нейтральное значение */
  carrierScore?: number;
};

export type RankQuotesOptions = {
  weights?: DecisionWeights;
  /** Ключ — providerKey перевозчика */
  carrierScores?: Record<string, number>;
  /** Значение по умолчанию, если Carrier Score ещё не посчитан */
  defaultCarrierScore?: number;
};

const NEUTRAL_CARRIER_SCORE = 50;

function quoteKey(q: DeliveryQuote): string {
  return `${q.providerKey}:${q.tariffId}:${q.deliveryMode}`;
}

function normalizeInSet(value: number, min: number, max: number): number {
  if (max === min) return 1;
  return (value - min) / (max - min);
}

function resolveCarrierScore(
  quote: QuoteForRanking,
  options: RankQuotesOptions,
): number {
  if (quote.carrierScore != null) {
    return Math.min(100, Math.max(0, quote.carrierScore));
  }
  const fromMap = options.carrierScores?.[quote.providerKey];
  if (fromMap != null) {
    return Math.min(100, Math.max(0, fromMap));
  }
  return options.defaultCarrierScore ?? NEUTRAL_CARRIER_SCORE;
}

function scoreOption(
  quote: QuoteForRanking,
  bounds: { minCost: number; maxCost: number; minDays: number; maxDays: number },
  weights: DecisionWeights,
  options: RankQuotesOptions,
): number {
  const normCost = normalizeInSet(
    quote.deliveryCostRub,
    bounds.minCost,
    bounds.maxCost,
  );
  const normSpeed = normalizeInSet(
    quote.deliveryDaysMin,
    bounds.minDays,
    bounds.maxDays,
  );
  const quality = resolveCarrierScore(quote, options) / 100;

  return (
    weights.cost * (1 - normCost) +
    weights.speed * (1 - normSpeed) +
    weights.quality * quality
  );
}

export function rankQuotes(
  quotes: QuoteForRanking[],
  options: RankQuotesOptions = {},
): RankedQuote[] {
  if (quotes.length === 0) return [];

  const weights = normalizeDecisionWeights(
    options.weights ?? DEFAULT_DECISION_WEIGHTS,
  );

  const costs = quotes.map((q) => q.deliveryCostRub);
  const days = quotes.map((q) => q.deliveryDaysMin);
  const bounds = {
    minCost: Math.min(...costs),
    maxCost: Math.max(...costs),
    minDays: Math.min(...days),
    maxDays: Math.max(...days),
  };

  const cheapest = quotes.reduce((a, b) =>
    a.deliveryCostRub < b.deliveryCostRub ? a : b,
  );
  const fastest = quotes.reduce((a, b) =>
    a.deliveryDaysMin < b.deliveryDaysMin ? a : b,
  );
  const optimal = quotes.reduce((best, current) =>
    scoreOption(current, bounds, weights, options) >
    scoreOption(best, bounds, weights, options)
      ? current
      : best,
  );

  const tagMap = new Map<string, Set<RankTag>>();

  const addTag = (q: DeliveryQuote, tag: RankTag) => {
    const k = quoteKey(q);
    if (!tagMap.has(k)) tagMap.set(k, new Set());
    tagMap.get(k)!.add(tag);
  };

  addTag(cheapest, "cheap");
  addTag(fastest, "fast");
  addTag(optimal, "optimal");

  return quotes.map((quote) => ({
    ...quote,
    tags: Array.from(tagMap.get(quoteKey(quote)) ?? []),
  }));
}
