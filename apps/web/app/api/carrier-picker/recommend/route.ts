import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { recommendCarriers } from "@/lib/carrier-picker/recommend";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

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
}
