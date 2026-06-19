import { NextResponse } from "next/server";
import { ApishipError } from "@oco/apiship";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db";
import {
  canUseApiship,
  getApishipClientForCompany,
} from "@/lib/apiship-client-for-company";
import { resolveSenderLocation, formatAddressForApiship } from "@/lib/sender-address";

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
          "Укажите город отправления в настройках компании — без него интервалы доставки недоступны",
      },
      { status: 400 },
    );
  }

  try {
    const body = await request.json();
    const providerKey = String(body.providerKey ?? "").trim();
    const tariffId = Number(body.tariffId);
    const weightG = Number(body.weightG);
    const lengthCm = Number(body.lengthCm);
    const widthCm = Number(body.widthCm);
    const heightCm = Number(body.heightCm);
    const destCity = String(body.destCity ?? "").trim();
    const destAddress = String(body.destAddress ?? "").trim();
    const pickupType = String(body.pickupType ?? "PVZ");
    const pointOutId = body.pointOutId != null ? Number(body.pointOutId) : undefined;

    if (!providerKey) {
      return NextResponse.json({ error: "Укажите службу доставки (providerKey)" }, { status: 400 });
    }

    if (!tariffId || tariffId <= 0) {
      return NextResponse.json({ error: "Укажите тариф (tariffId)" }, { status: 400 });
    }

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
    const intervals = await client.getIntervals(providerKey, tariffId, {
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

    return NextResponse.json({ intervals });
  } catch (error) {
    if (error instanceof ApishipError) {
      console.error("intervals ApishipError", {
        statusCode: error.statusCode,
        code: error.code,
      });
      return NextResponse.json(
        {
          error:
            error.message ||
            "APIShip не смог получить интервалы доставки. Проверьте адреса и параметры посылки.",
        },
        { status: 502 },
      );
    }
    console.error("intervals failed");
    return NextResponse.json(
      { error: "Не удалось получить интервалы доставки. Попробуйте позже." },
      { status: 500 },
    );
  }
}
