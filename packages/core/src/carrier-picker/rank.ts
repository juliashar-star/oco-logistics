import {
  CATEGORY_TO_PROFILE,
  CARRIER_REGISTRY,
  type ProfileId,
} from "./registry";
import type { CarrierScore } from "./score";

export type Priority = "cheaper" | "faster" | "reliable" | "fewer_returns";
export type MethodFilter = "pvz" | "courier" | "both";
export type RegionScope = "all_russia" | "small_towns" | "city";

export type RankInput = {
  category: string;
  region: RegionScope;
  priority: Priority;
  method: MethodFilter;
};

export type RankedCarrier = {
  providerKey: string;
  displayName: string;
  score: number;
  reasons: string[];
  carrierScore?: CarrierScore;
};

export type RankResult = {
  profile: ProfileId | ProfileId[] | null;
  ambiguous: boolean;
  ranked: RankedCarrier[];
};

const SCORE_REGION = 10;
const SCORE_METHOD = 10;
const SCORE_PRIORITY = 10;
const TOP_N = 3;

const REGION_WIDE_COVERAGE_CARRIERS = new Set(["rupost", "cdek"]);
const REGION_CITY_CARRIERS = new Set(["yataxi", "dostavista", "logsis"]);

const METHOD_PVZ_CARRIERS = new Set(["boxberry", "cdek", "x5"]);
const METHOD_COURIER_CARRIERS = new Set(["yataxi", "cdek", "dpd"]);

const PRIORITY_CHEAPER_CARRIERS = new Set(["boxberry", "rupost", "x5"]);
const PRIORITY_FASTER_CARRIERS = new Set(["yataxi", "cdek"]);
const PRIORITY_RELIABLE_CARRIERS = new Set(["cdek", "boxberry"]);
const PRIORITY_FEWER_RETURNS_CARRIERS = new Set(["boxberry", "cdek"]);

const REGION_WIDE_REASONS: Record<string, string> = {
  rupost: "Рекордное географическое покрытие — малые города и сёла",
  cdek: "Широкая сеть ПВЗ для региона",
};

const REGION_CITY_REASONS: Record<string, string> = {
  yataxi: "Быстрая доставка по городу и пригороду",
  dostavista: "Экспресс-курьер день-в-день в городе",
  logsis: "Локальная курьерская доставка в городе",
};

const METHOD_PVZ_REASONS: Record<string, string> = {
  boxberry: "Развитая сеть ПВЗ для самовывоза",
  cdek: "ПВЗ и постаматы в большинстве городов",
  x5: "Дешёвый самовывоз через постаматы",
};

const METHOD_COURIER_REASONS: Record<string, string> = {
  yataxi: "Курьерская доставка день-в-день",
  cdek: "Курьер до двери и в ПВЗ",
  dpd: "Курьер и терминалы для средних отправлений",
};

const PRIORITY_CHEAPER_REASONS: Record<string, string> = {
  boxberry: "Низкие тарифы для малогабарита",
  rupost: "Доступная доставка по всей России",
  x5: "Дешёвый самовывоз через постаматы",
};

const PRIORITY_FASTER_REASONS: Record<string, string> = {
  yataxi: "Экспресс в городе — день в день",
  cdek: "СДЭК-экспресс и быстрая сеть ПВЗ",
};

const PRIORITY_RELIABLE_REASONS: Record<string, string> = {
  cdek: "Надёжная коммерческая сеть с контролем",
  boxberry: "Стабильная e-commerce доставка",
};

const PRIORITY_FEWER_RETURNS_REASONS: Record<string, string> = {
  boxberry: "Широкая сеть ПВЗ — простой возврат",
  cdek: "Удобный возврат через ПВЗ по всей стране",
};

const PRIORITY_CARRIER_SETS: Record<
  Priority,
  { carriers: Set<string>; reasons: Record<string, string> }
> = {
  cheaper: { carriers: PRIORITY_CHEAPER_CARRIERS, reasons: PRIORITY_CHEAPER_REASONS },
  faster: { carriers: PRIORITY_FASTER_CARRIERS, reasons: PRIORITY_FASTER_REASONS },
  reliable: { carriers: PRIORITY_RELIABLE_CARRIERS, reasons: PRIORITY_RELIABLE_REASONS },
  fewer_returns: {
    carriers: PRIORITY_FEWER_RETURNS_CARRIERS,
    reasons: PRIORITY_FEWER_RETURNS_REASONS,
  },
};

function carrierMatchesProfiles(
  carrierProfiles: ProfileId[],
  categoryProfiles: ProfileId[],
): boolean {
  return carrierProfiles.some((p) => categoryProfiles.includes(p));
}

function applyRegionScore(
  providerKey: string,
  region: RegionScope,
): { delta: number; reason?: string } {
  if (region === "small_towns" || region === "all_russia") {
    if (!REGION_WIDE_COVERAGE_CARRIERS.has(providerKey)) return { delta: 0 };
    return { delta: SCORE_REGION, reason: REGION_WIDE_REASONS[providerKey] };
  }
  if (region === "city") {
    if (!REGION_CITY_CARRIERS.has(providerKey)) return { delta: 0 };
    return { delta: SCORE_REGION, reason: REGION_CITY_REASONS[providerKey] };
  }
  return { delta: 0 };
}

function applyMethodScore(
  providerKey: string,
  method: MethodFilter,
): { delta: number; reason?: string } {
  if (method === "pvz") {
    if (!METHOD_PVZ_CARRIERS.has(providerKey)) return { delta: 0 };
    return { delta: SCORE_METHOD, reason: METHOD_PVZ_REASONS[providerKey] };
  }
  if (method === "courier") {
    if (!METHOD_COURIER_CARRIERS.has(providerKey)) return { delta: 0 };
    return { delta: SCORE_METHOD, reason: METHOD_COURIER_REASONS[providerKey] };
  }
  return { delta: 0 };
}

function applyPriorityScore(
  providerKey: string,
  priority: Priority,
): { delta: number; reason?: string } {
  const { carriers, reasons } = PRIORITY_CARRIER_SETS[priority];
  if (!carriers.has(providerKey)) return { delta: 0 };
  return { delta: SCORE_PRIORITY, reason: reasons[providerKey] };
}

function scoreCarrier(providerKey: string, input: RankInput): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  for (const { delta, reason } of [
    applyRegionScore(providerKey, input.region),
    applyMethodScore(providerKey, input.method),
    applyPriorityScore(providerKey, input.priority),
  ]) {
    if (delta > 0 && reason) {
      score += delta;
      reasons.push(reason);
    }
  }

  return { score, reasons };
}

export function rankCarriers(input: RankInput): RankResult {
  const mapping = CATEGORY_TO_PROFILE.find((m) => m.category === input.category);
  if (!mapping) {
    return { profile: null, ambiguous: false, ranked: [] };
  }

  const categoryProfiles = mapping.profiles;
  const ambiguous = categoryProfiles.length > 1;
  const profile: ProfileId | ProfileId[] =
    categoryProfiles.length === 1 ? categoryProfiles[0]! : categoryProfiles;

  const eligible = CARRIER_REGISTRY.filter((carrier) =>
    carrierMatchesProfiles(carrier.profiles, categoryProfiles),
  );

  const ranked = eligible
    .map((carrier) => {
      const { score, reasons } = scoreCarrier(carrier.providerKey, input);
      return {
        providerKey: carrier.providerKey,
        displayName: carrier.displayName,
        score,
        reasons,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.providerKey.localeCompare(b.providerKey);
    })
    .slice(0, TOP_N);

  return { profile, ambiguous, ranked };
}
