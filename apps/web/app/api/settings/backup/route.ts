import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";
import {
  buildSettingsBackup,
  settingsBackupFilename,
} from "@/lib/settings/backup";

export const GET = withAuth(async (request, user) => {
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

  const exportedAt = new Date();
  const payload = buildSettingsBackup(company, exportedAt);
  const body = JSON.stringify(payload, null, 2);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${settingsBackupFilename(exportedAt)}"`,
      "Cache-Control": "no-store",
    },
  });
});
