export {
  DEFAULT_DECISION_WEIGHTS,
  normalizeDecisionWeights,
  type DecisionWeights,
} from "./decision-weights";
export {
  rankQuotes,
  type QuoteForRanking,
  type RankedQuote,
  type RankQuotesOptions,
  type RankTag,
} from "./rank-quotes";
export {
  rankCarriers,
  type RankInput,
  type RankResult,
  type RankedCarrier,
  type Priority,
  type MethodFilter,
  type RegionScope,
} from "./carrier-picker/rank";
export {
  getCarrierScore,
  applyCarrierScore,
  type CarrierScore,
} from "./carrier-picker/score";
export {
  CATEGORY_TO_PROFILE,
  CARRIER_REGISTRY,
  type Carrier,
  type CarrierHealthStatus,
  type CoverageLevel,
  type DeliveryMethod,
  type SourcedFact,
  type SpecialMode,
  type WeightLimits,
} from "./carrier-picker/registry";
export { deriveFactBasedProfiles } from "./carrier-picker/profile-fit";
export {
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendCarrierConnectionRequestNotification,
} from "../lib/email";
