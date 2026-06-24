import { NextResponse } from "next/server";
import { recommendCarriers } from "@/lib/carrier-picker/recommend";
import {
  isPublicRecommendBlocked,
  recordPublicRecommendAttempt,
} from "@/lib/auth/rate-limit";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(request: Request) {
  const key = clientIp(request);
  if (isPublicRecommendBlocked(key)) {
    return NextResponse.json(
      { error: "Слишком много запросов. Попробуйте через минуту." },
      { status: 429 },
    );
  }

  recordPublicRecommendAttempt(key);

  try {
    const body = await request.json();
    const result = await recommendCarriers(body);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.data);
  } catch {
    console.error("carrier-picker public-recommend failed");
    return NextResponse.json(
      { error: "Не удалось подобрать перевозчиков. Попробуйте позже." },
      { status: 500 },
    );
  }
}
