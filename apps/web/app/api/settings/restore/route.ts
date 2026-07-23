import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit/log";
import {
  parseSettingsBackup,
  restoreDataFromBackup,
  SettingsBackupError,
} from "@/lib/settings/backup";

const MAX_RESTORE_BODY_BYTES = 65_536;

async function readJsonBodyWithLimit(request: Request, maxBytes: number): Promise<unknown> {
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new BodyTooLargeError();
    }
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return null;
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder().decode(body);
  if (!text.trim()) {
    return null;
  }

  return JSON.parse(text) as unknown;
}

class BodyTooLargeError extends Error {
  constructor() {
    super("BODY_TOO_LARGE");
    this.name = "BodyTooLargeError";
  }
}

export const POST = withAuth(async (request, user) => {
  try {
    const raw = await readJsonBodyWithLimit(request, MAX_RESTORE_BODY_BYTES);
    const payload = parseSettingsBackup(raw);
    const data = restoreDataFromBackup(payload);

    await prisma.company.updateMany({
      where: { id: user.companyId },
      data: {
        senderCity: data.senderCity,
        senderAddress: data.senderAddress,
        senderPhone: data.senderPhone,
      },
    });

    void logAuditEvent({
      userId: user.userId,
      companyId: user.companyId,
      action: "settings.restore",
      entityType: "company",
      entityId: user.companyId,
    });

    return NextResponse.json({
      ok: true,
      restoredFrom: payload.exportedAt,
      companyName: payload.company.name,
      senderConfigured: Boolean(data.senderCity),
    });
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return NextResponse.json(
        { error: "Файл резервной копии слишком большой" },
        { status: 413 },
      );
    }
    if (error instanceof SettingsBackupError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Файл не является корректным JSON" }, { status: 400 });
    }
    console.error("settings restore failed");
    return NextResponse.json(
      { error: "Не удалось восстановить настройки" },
      { status: 500 },
    );
  }
});
