import { NextResponse } from "next/server";
import { DEFAULT_DECISION_WEIGHTS, rankQuotes } from "@oco/core";
import { ApishipError } from "@oco/apiship";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db";
import {
  canUseApiship,
  getApishipClientForCompany,
} from "@/lib/apiship-client-for-company";
import { resolveSenderLocation, formatAddressForApiship } from "@/lib/sender-address";
import { persistTariffQuotes } from "@/lib/tariff-quotes/persist-tariff-quotes";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  const company = await prisma.company.findFirst({
    where: { id: user.companyId },
    select: {
      senderCity: true,
      senderAddress: true,
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

  const sender = resolveSenderLocation(company);
  if (!sender) {
    return NextResponse.json(
      {
        error:
          "Укажите город отправления в настройках компании — без него расчёт тарифов неточен",
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
    const destAddress = String(body.destAddress ?? "").trim();
    const pickupType = String(body.pickupType ?? "PVZ");
    const pointOutId = body.pointOutId != null ? Number(body.pointOutId) : undefined;

    if (!destCity) {
      return NextResponse.json({ error: "Укажите город назначения" }, { status: 400 });
    }

    if (pickupType === "COURIER" && !destAddress) {
      return NextResponse.json(
        { error: "Укажите полный адрес доставки для курьера" },
        { status: 400 },
      );
    }

    if (pickupType === "PVZ" && (!pointOutId || pointOutId <= 0)) {
      return NextResponse.json(
        { error: "Выберите пункт выдачи (ПВЗ) в городе назначения" },
        { status: 400 },
      );
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

    const deliveryTypes = pickupType === "COURIER" ? [1] : [2];

    const client = await getApishipClientForCompany(user.companyId);
    const result = await client.calculate({
      from: {
        countryCode: "RU",
        city: sender.city,
        addressString: sender.addressString,
      },
      to: {
        countryCode: "RU",
        city: destCity,
        ...(pickupType === "COURIER"
          ? { addressString: formatAddressForApiship(destCity, destAddress) }
          : {}),
      },
      weightG,
      lengthCm,
      widthCm,
      heightCm,
      deliveryTypes,
      ...(pickupType === "PVZ" && pointOutId ? { pointOutId } : {}),
    });

    const savedQuotes = await persistTariffQuotes({
      companyId: user.companyId,
      quotes: result.quotes,
      rawResponse: result.rawResponse,
    });

    const quotes = rankQuotes(result.quotes, {
      weights: DEFAULT_DECISION_WEIGHTS,
    });

    const quoteIds = Object.fromEntries(
      savedQuotes.map((row) => [
        `${row.providerKey}:${row.tariffId}:${row.deliveryMode}`,
        row.id,
      ]),
    );

    return NextResponse.json({
      ok: true,
      fromCity: sender.city,
      fromAddress: sender.addressString ?? null,
      destCity,
      destAddress: pickupType === "COURIER" ? destAddress : null,
      pointOutId: pickupType === "PVZ" ? pointOutId : null,
      quotes,
      quoteIds,
      savedCount: savedQuotes.length,
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
