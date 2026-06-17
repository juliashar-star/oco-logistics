import { NextResponse } from "next/server";
import { rankQuotes } from "@oco/core";
import { ApishipError } from "@oco/apiship";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db";
import { scopeToCompany } from "@/lib/company-scope";
import {
  canUseApiship,
  getApishipClientForCompany,
} from "@/lib/apiship-client-for-company";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  const company = await prisma.company.findFirst({
    where: scopeToCompany(user.companyId, { id: user.companyId }),
    select: {
      senderCity: true,
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

  try {
    const body = await request.json();
    const weightG = Number(body.weightG);
    const lengthCm = Number(body.lengthCm);
    const widthCm = Number(body.widthCm);
    const heightCm = Number(body.heightCm);
    const destCity = String(body.destCity ?? "").trim();
    const pickupType = String(body.pickupType ?? "PVZ");

    if (!destCity) {
      return NextResponse.json({ error: "Укажите город назначения" }, { status: 400 });
    }

    if (!weightG || weightG <= 0) {
      return NextResponse.json({ error: "Вес должен быть больше 0" }, { status: 400 });
    }

    if (lengthCm <= 0 || widthCm <= 0 || heightCm <= 0) {
      return NextResponse.json(
        { error: "Габариты должны быть больше 0" },
        { status: 400 },
      );
    }

    const fromCity = company.senderCity?.trim() || "Москва";
    const deliveryTypes = pickupType === "COURIER" ? [1] : [2];

    const client = await getApishipClientForCompany(user.companyId);
    const result = await client.calculate({
      from: { countryCode: "RU", city: fromCity },
      to: { countryCode: "RU", city: destCity },
      weightG,
      lengthCm,
      widthCm,
      heightCm,
      deliveryTypes,
    });

    const quotes = rankQuotes(result.quotes);

    return NextResponse.json({
      ok: true,
      fromCity,
      destCity,
      quotes,
      count: quotes.length,
    });
  } catch (error) {
    if (error instanceof ApishipError) {
      return NextResponse.json(
        {
          error:
            error.message ||
            "APIShip не смог рассчитать тарифы. Проверьте адреса и параметры посылки.",
        },
        { status: 502 },
      );
    }
    console.error("calculate failed");
    return NextResponse.json(
      { error: "Не удалось рассчитать тарифы. Попробуйте позже." },
      { status: 500 },
    );
  }
}
