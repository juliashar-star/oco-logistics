/** Веса факторов Decision Engine (сумма должна быть 1). */
export type DecisionWeights = {
  cost: number;
  speed: number;
  quality: number;
};

/** Значения по умолчанию — см. docs/DECISION_ENGINE.md */
export const DEFAULT_DECISION_WEIGHTS: DecisionWeights = {
  cost: 0.4,
  speed: 0.3,
  quality: 0.3,
};

export function normalizeDecisionWeights(weights: DecisionWeights): DecisionWeights {
  const sum = weights.cost + weights.speed + weights.quality;
  if (sum <= 0) {
    return { ...DEFAULT_DECISION_WEIGHTS };
  }
  return {
    cost: weights.cost / sum,
    speed: weights.speed / sum,
    quality: weights.quality / sum,
  };
}
