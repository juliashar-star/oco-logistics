import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db";
import {
  parseSettingsBackup,
  restoreDataFromBackup,
  SettingsBackupError,
} from "@/lib/settings/backup";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  try {
    const raw = await request.json();
    const payload = parseSettingsBackup(raw);
    const data = restoreDataFromBackup(payload);

    await prisma.company.updateMany({
      where: { id: user.companyId },
      data: {
        senderCity: data.senderCity,
        senderAddress: data.senderAddress,
        senderPhone: data.senderPhone,
        apishipLogin: null,
        apishipPasswordEnc: null,
        apishipConnectedAt: null,
      },
    });

    return NextResponse.json({
      ok: true,
      restoredFrom: payload.exportedAt,
      companyName: payload.company.name,
      senderConfigured: Boolean(data.senderCity),
      apishipConnected: false,
      requiresApishipReconnect: true,
    });
  } catch (error) {
    if (error instanceof SettingsBackupError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("settings restore failed");
    return NextResponse.json(
      { error: "Не удалось восстановить настройки" },
      { status: 500 },
    );
  }
}
