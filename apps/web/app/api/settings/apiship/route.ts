import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db";
import { scopeToCompany } from "@/lib/company-scope";
import {
  encryptApishipPassword,
  isApishipEncryptionConfigured,
  isSandboxApishipUrl,
  maskApishipLogin,
} from "@/lib/apiship-credentials";
import {
  canUseApiship,
  canUseEnvApishipFallback,
  isCompanyApishipConnected,
} from "@/lib/apiship-client-for-company";

function hasEnvFallback(): boolean {
  return canUseEnvApishipFallback();
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  const company = await prisma.company.findFirst({
    where: scopeToCompany(user.companyId, { id: user.companyId }),
    select: {
      apishipLogin: true,
      apishipPasswordEnc: true,
      apishipConnectedAt: true,
    },
  });

  if (!company) {
    return NextResponse.json({ error: "Компания не найдена" }, { status: 404 });
  }

  return NextResponse.json({
    connected: isCompanyApishipConnected(company),
    login: company.apishipLogin ? maskApishipLogin(company.apishipLogin) : null,
    connectedAt: company.apishipConnectedAt?.toISOString() ?? null,
    isSandbox: isSandboxApishipUrl(),
    canCalculate: canUseApiship(company),
    envConfigured: hasEnvFallback(),
    encryptionConfigured: isApishipEncryptionConfigured(),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const login = String(body.login ?? "").trim();
    const password = String(body.password ?? "");

    if (!login) {
      return NextResponse.json({ error: "Укажите логин APIShip" }, { status: 400 });
    }

    const existing = await prisma.company.findFirst({
      where: scopeToCompany(user.companyId, { id: user.companyId }),
      select: { apishipPasswordEnc: true },
    });

    if (!password && !existing?.apishipPasswordEnc) {
      return NextResponse.json({ error: "Укажите пароль APIShip" }, { status: 400 });
    }

    if (!isApishipEncryptionConfigured()) {
      return NextResponse.json(
        {
          error:
            "Не настроен ключ шифрования APISHIP_ENCRYPTION_KEY в .env. Добавьте строку минимум 32 символа и перезапустите npm run dev.",
        },
        { status: 503 },
      );
    }

    const passwordEnc = password
      ? encryptApishipPassword(password)
      : existing!.apishipPasswordEnc!;

    await prisma.company.updateMany({
      where: scopeToCompany(user.companyId, { id: user.companyId }),
      data: {
        apishipLogin: login,
        apishipPasswordEnc: passwordEnc,
        apishipConnectedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, connected: true });
  } catch (error) {
    console.error("apiship settings save failed");
    if (error instanceof Error && error.message === "APISHIP_ENCRYPTION_KEY_MISSING") {
      return NextResponse.json(
        {
          error:
            "Не настроен ключ шифрования APISHIP_ENCRYPTION_KEY в .env. Добавьте строку минимум 32 символа и перезапустите npm run dev.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "Не удалось сохранить настройки APIShip" },
      { status: 500 },
    );
  }
}
