import { z } from "zod";
import { applyCarrierScore, rankCarriers } from "@oco/core";

const requestSchema = z.object({
  category: z.string().trim().min(1, "Укажите категорию"),
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

export type CarrierRecommendSuccess = {
  carriers: ReturnType<typeof applyCarrierScore>["ranked"];
  profile: string | null;
  ambiguous: boolean;
};

export type CarrierRecommendResult =
  | { ok: true; data: CarrierRecommendSuccess }
  | { ok: false; error: string; status: 400 | 500 };

export function recommendCarriers(body: unknown): CarrierRecommendResult {
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? "Некорректные данные";
    return { ok: false, error: message, status: 400 };
  }

  const { category, parcel } = parsed.data;
  const { weight, maxSideCm } = parcel;

  // TODO: pass connectedCarriers from listConnections() — Task 4 gap
  const ranked = rankCarriers({
    category,
    region: "all_russia",
    priority: "reliable",
    method: "both",
    weight,
    maxSideCm,
  });
  const scored = applyCarrierScore(ranked);

  return {
    ok: true,
    data: {
      carriers: scored.ranked,
      profile: formatProfile(scored.profile),
      ambiguous: scored.ambiguous,
    },
  };
}
