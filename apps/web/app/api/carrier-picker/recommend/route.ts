import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { recommendCarriers } from "@/lib/carrier-picker/recommend";

export const POST = withAuth(async (request, user) => {
  try {
    const body = await request.json();
    const result = await recommendCarriers(body, user.companyId);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.data);
  } catch {
    console.error("carrier-picker recommend failed");
    return NextResponse.json(
      { error: "Не удалось подобрать перевозчиков. Попробуйте позже." },
      { status: 500 },
    );
  }
});
