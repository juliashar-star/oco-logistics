import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db";
import { normalizeRuPhone } from "@/lib/phone/ru-phone";

const companySettingsSchema = z.object({
  senderCity: z.string().trim().min(1, "Укажите город отправления"),
  senderAddress: z.string().trim().optional().default(""),
  senderPhone: z.string().trim().optional().default(""),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  const company = await prisma.company.findFirst({
    where: { id: user.companyId },
    select: {
      name: true,
      senderCity: true,
      senderAddress: true,
      senderPhone: true,
    },
  });

  if (!company) {
    return NextResponse.json({ error: "Компания не найдена" }, { status: 404 });
  }

  const senderCity = company.senderCity?.trim() ?? "";
  const senderAddress = company.senderAddress?.trim() ?? "";
  const senderPhone = company.senderPhone?.trim() ?? "";

  return NextResponse.json({
    name: company.name,
    senderCity,
    senderAddress,
    senderPhone,
    senderConfigured: Boolean(senderCity),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = companySettingsSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.errors[0]?.message ?? "Некорректные данные";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { senderCity, senderAddress, senderPhone: senderPhoneRaw } = parsed.data;

    let senderPhone: string | null = null;
    if (senderPhoneRaw) {
      const normalized = normalizeRuPhone(senderPhoneRaw);
      if (!normalized.ok) {
        return NextResponse.json({ error: normalized.error }, { status: 400 });
      }
      senderPhone = normalized.value || null;
    }

    await prisma.company.updateMany({
      where: { id: user.companyId },
      data: {
        senderCity,
        senderAddress: senderAddress || null,
        senderPhone,
      },
    });

    return NextResponse.json({
      ok: true,
      senderCity,
      senderAddress,
      senderPhone: senderPhone ?? "",
      senderConfigured: true,
    });
  } catch {
    console.error("company settings save failed");
    return NextResponse.json(
      { error: "Не удалось сохранить профиль компании" },
      { status: 500 },
    );
  }
}
