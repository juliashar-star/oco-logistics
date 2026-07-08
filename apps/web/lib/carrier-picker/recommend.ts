import { z } from "zod";
import { applyCarrierScore, rankCarriers } from "@oco/core";
import { prisma } from "@/lib/db";
import { fetchConnectedCarriers } from "@/lib/carrier-picker/connected-carriers";

const requestSchema = z.object({
  category: z.string().trim().min(1, "Укажите категорию"),
  needsFragile: z.boolean().optional(),
  parcel: z.object({
    weight: z.coerce.number().positive("Вес должен быть больше 0"),
    value: z.coerce.number().min(0, "Стоимость не может быть отрицательной"),
    maxSideCm: z.coerce.number().positive("Длинная сторона должна быть больше 0").optional(),
  }),
});

function formatProfile(profile: string | string[] | null): string | null {
  if (profile === null) return null;
  if (Array.isArray(profile)) return profile.join(",");
  return profile;
}

type ScoredCarrier = ReturnType<typeof applyCarrierScore>["ranked"][number];

export type CarrierRecommendSuccess = {
  carriers: Array<ScoredCarrier & { pendingRequestAt: string | null }>;
  profile: string | null;
  ambiguous: boolean;
  reason?: string;
};

export type CarrierRecommendResult =
  | { ok: true; data: CarrierRecommendSuccess }
  | { ok: false; error: string; status: 400 | 500 };

async function fetchPendingConnectionRequests(companyId: string): Promise<Map<string, string>> {
  const rows = await prisma.carrierConnectionRequest.findMany({
    where: { companyId },
    select: { providerKey: true, createdAt: true },
  });
  return new Map(rows.map((row) => [row.providerKey, row.createdAt.toISOString()]));
}

export async function recommendCarriers(
  body: unknown,
  companyId?: string,
): Promise<CarrierRecommendResult> {
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? "Некорректные данные";
    return { ok: false, error: message, status: 400 };
  }

  const { category, parcel, needsFragile } = parsed.data;
  const { weight, maxSideCm } = parcel;

  const connectedCarriers = companyId ? await fetchConnectedCarriers(companyId) : undefined;
  const pendingRequests = companyId
    ? await fetchPendingConnectionRequests(companyId)
    : new Map<string, string>();

  const ranked = rankCarriers({
    category,
    region: "all_russia",
    priority: "reliable",
    method: "both",
    weight,
    maxSideCm,
    connectedCarriers,
    needsFragile,
  });
  const scored = applyCarrierScore(ranked);

  return {
    ok: true,
    data: {
      carriers: scored.ranked.map((carrier) => ({
        ...carrier,
        pendingRequestAt: pendingRequests.get(carrier.providerKey) ?? null,
      })),
      profile: formatProfile(scored.profile),
      ambiguous: scored.ambiguous,
      reason: scored.reason,
    },
  };
}
