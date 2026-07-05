import { NextResponse } from "next/server";
import { recommendCarriers } from "@/lib/carrier-picker/recommend";
import {
  isPublicRecommendBlocked,
  recordPublicRecommendAttempt,
} from "@/lib/auth/rate-limit";
import { getClientIp } from "@/lib/http/client-ip";

// Same Origin/Referer CSRF check as all mutating API routes (middleware).
// Not exempt: today the UI calls this same-origin only; cross-origin embed would need an explicit decision.
export async function POST(request: Request) {
  try {
    const key = getClientIp(request);
    if (await isPublicRecommendBlocked(key)) {
      return NextResponse.json(
        { error: "Слишком много запросов. Попробуйте через минуту." },
        { status: 429 },
      );
    }

    await recordPublicRecommendAttempt(key);

    const body = await request.json();
    const result = await recommendCarriers(body);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error("carrier-picker public-recommend failed", error);
    return NextResponse.json(
      { error: "Не удалось подобрать перевозчиков. Попробуйте позже." },
      { status: 500 },
    );
  }
}
