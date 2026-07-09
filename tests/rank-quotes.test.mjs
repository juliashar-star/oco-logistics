import test from "node:test";
import assert from "node:assert/strict";

// NOTE: This test uses an inline copy of ranking logic, not a real
// import, because rank-quotes.ts has extension-less relative imports
// (e.g. "./decision-weights") that don't resolve under direct Node
// ESM/tsx loading without a bundler. This is a known gap, not a
// stylistic choice — see DECISIONS.md canonical modules table.
// Do not copy this inline-copy pattern for NEW tests; it's a
// workaround for this specific file, not the recommended approach.
const DEFAULT_DECISION_WEIGHTS = { cost: 0.4, speed: 0.3, quality: 0.3 };

function normalizeDecisionWeights(weights) {
  const sum = weights.cost + weights.speed + weights.quality;
  if (sum <= 0) return { ...DEFAULT_DECISION_WEIGHTS };
  return {
    cost: weights.cost / sum,
    speed: weights.speed / sum,
    quality: weights.quality / sum,
  };
}

function quoteKey(q) {
  return `${q.providerKey}:${q.tariffId}:${q.deliveryMode}`;
}

function normalizeInSet(value, min, max) {
  if (max === min) return 1;
  return (value - min) / (max - min);
}

function rankQuotes(quotes, options = {}) {
  if (quotes.length === 0) return [];

  const weights = normalizeDecisionWeights(options.weights ?? DEFAULT_DECISION_WEIGHTS);
  const costs = quotes.map((q) => q.deliveryCostRub);
  const days = quotes.map((q) => q.deliveryDaysMin);
  const bounds = {
    minCost: Math.min(...costs),
    maxCost: Math.max(...costs),
    minDays: Math.min(...days),
    maxDays: Math.max(...days),
  };

  const scoreOption = (quote) => {
    const normCost = normalizeInSet(quote.deliveryCostRub, bounds.minCost, bounds.maxCost);
    const normSpeed = normalizeInSet(quote.deliveryDaysMin, bounds.minDays, bounds.maxDays);
    const quality = (quote.carrierScore ?? 50) / 100;
    return (
      weights.cost * (1 - normCost) +
      weights.speed * (1 - normSpeed) +
      weights.quality * quality
    );
  };

  const cheapest = quotes.reduce((a, b) => (a.deliveryCostRub < b.deliveryCostRub ? a : b));
  const fastest = quotes.reduce((a, b) => (a.deliveryDaysMin < b.deliveryDaysMin ? a : b));
  const optimal = quotes.reduce((best, current) =>
    scoreOption(current) > scoreOption(best) ? current : best,
  );

  const tagMap = new Map();
  const addTag = (q, tag) => {
    const k = quoteKey(q);
    if (!tagMap.has(k)) tagMap.set(k, new Set());
    tagMap.get(k).add(tag);
  };

  addTag(cheapest, "cheap");
  addTag(fastest, "fast");
  addTag(optimal, "optimal");

  return quotes.map((quote) => ({
    ...quote,
    tags: Array.from(tagMap.get(quoteKey(quote)) ?? []),
  }));
}

const sample = [
  {
    providerKey: "cdek",
    tariffId: 1,
    tariffName: "A",
    deliveryCostRub: 500,
    deliveryDaysMin: 5,
    deliveryDaysMax: 5,
    deliveryMode: "point",
  },
  {
    providerKey: "boxberry",
    tariffId: 2,
    tariffName: "B",
    deliveryCostRub: 300,
    deliveryDaysMin: 7,
    deliveryDaysMax: 7,
    deliveryMode: "point",
  },
  {
    providerKey: "dpd",
    tariffId: 3,
    tariffName: "C",
    deliveryCostRub: 400,
    deliveryDaysMin: 3,
    deliveryDaysMax: 3,
    deliveryMode: "door",
  },
];

test("rankQuotes tags cheap, fast and optimal", () => {
  const ranked = rankQuotes(sample);
  const cheap = ranked.find((q) => q.providerKey === "boxberry");
  const fast = ranked.find((q) => q.providerKey === "dpd");
  assert.ok(cheap?.tags.includes("cheap"));
  assert.ok(fast?.tags.includes("fast"));
  assert.equal(ranked.filter((q) => q.tags.includes("optimal")).length, 1);
});

test("rankQuotes optimal respects custom weights", () => {
  const onlyCost = rankQuotes(sample, {
    weights: { cost: 1, speed: 0, quality: 0 },
  });
  const optimal = onlyCost.find((q) => q.tags.includes("optimal"));
  assert.equal(optimal?.providerKey, "boxberry");
});

test("normalizeDecisionWeights rescales to sum 1", () => {
  const w = normalizeDecisionWeights({ cost: 2, speed: 2, quality: 2 });
  assert.ok(Math.abs(w.cost + w.speed + w.quality - 1) < 0.0001);
});
