import type { RankResult } from "./rank";

export type CarrierScore = {
  providerKey: string;
  avgDeliveryDays: number | null;
  returnRate: number | null;
  sampleSize: number;
  hasData: boolean;
};

// TODO — заменить на чтение из накопленной статистики, когда появится Carrier Score эпик.
// Сигнатура getCarrierScore не должна меняться при этой замене.
export function getCarrierScore(providerKey: string): CarrierScore {
  return {
    providerKey,
    avgDeliveryDays: null,
    returnRate: null,
    sampleSize: 0,
    hasData: false,
  };
}

export function applyCarrierScore(result: RankResult): RankResult {
  return {
    ...result,
    ranked: result.ranked.map((carrier) => ({
      ...carrier,
      carrierScore: getCarrierScore(carrier.providerKey),
    })),
  };
}
