import { NextResponse } from "next/server";
import { ApishipError } from "@oco/apiship";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db";
import {
  canUseApiship,
  getApishipClientForCompany,
} from "@/lib/apiship-client-for-company";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  const company = await prisma.company.findFirst({
    where: { id: user.companyId },
    select: {
      apishipLogin: true,
      apishipPasswordEnc: true,
      apishipConnectedAt: true,
    },
  });

  if (!company || !canUseApiship(company)) {
    return NextResponse.json(
      {
        error:
          "APIShip не подключён. Укажите логин и пароль в настройках или задайте APIShip в .env",
      },
      { status: 400 },
    );
  }

  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city")?.trim() ?? "";
  const limit = Math.min(Number(searchParams.get("limit") ?? 100), 200);
  const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);

  if (!city) {
    return NextResponse.json({ error: "Укажите город для поиска ПВЗ" }, { status: 400 });
  }

  try {
    const client = await getApishipClientForCompany(user.companyId);
    const result = await client.listPoints({ city, limit, offset });

    return NextResponse.json({
      ok: true,
      city,
      points: result.points,
      total: result.total,
      offset: result.offset,
      limit: result.limit,
    });
  } catch (error) {
    if (error instanceof ApishipError) {
      return NextResponse.json(
        { error: error.message || "APIShip не вернул список ПВЗ" },
        { status: 502 },
      );
    }
    console.error("points list failed");
    return NextResponse.json(
      { error: "Не удалось загрузить список ПВЗ. Попробуйте позже." },
      { status: 500 },
    );
  }
}
