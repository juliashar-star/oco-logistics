import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit/log";

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * Anonymizes recipient PII on a Shipment and linked TariffQuote.rawResponse.
 * Known limitation (152-FZ): APIShip retains a copy of recipient data on their
 * servers after order creation — there is no delete/anonymize API on their side.
 * TrackingEvent.rawResponse is left unchanged (low PII risk).
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  const { id } = await params;
  const shipmentId = id.trim();
  if (!shipmentId) {
    return NextResponse.json({ error: "Отправление не найдено" }, { status: 404 });
  }

  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: { id: true, companyId: true, isAnonymized: true },
  });

  if (!shipment) {
    return NextResponse.json({ error: "Отправление не найдено" }, { status: 404 });
  }

  if (shipment.companyId !== user.companyId) {
    return NextResponse.json({ error: "Нет доступа к этому отправлению" }, { status: 403 });
  }

  if (shipment.isAnonymized) {
    return NextResponse.json({ error: "already_anonymized" }, { status: 400 });
  }

  try {
    await prisma.$transaction([
      prisma.shipment.update({
        where: { id: shipmentId },
        data: {
          recipientName: "УДАЛЕНО",
          recipientPhone: "УДАЛЕНО",
          destAddress: "УДАЛЕНО",
          pvzCode: null,
          destCity: "УДАЛЕНО",
          isAnonymized: true,
        },
      }),
      prisma.tariffQuote.updateMany({
        where: { shipmentId },
        data: { rawResponse: Prisma.DbNull },
      }),
    ]);

    void logAuditEvent({
      userId: user.userId,
      companyId: user.companyId,
      action: "shipment.anonymize",
      entityType: "shipment",
      entityId: shipmentId,
    });

    return NextResponse.json({ ok: true });
  } catch {
    console.error("anonymize shipment failed", { shipmentId });
    return NextResponse.json(
      { error: "Не удалось удалить данные получателя" },
      { status: 500 },
    );
  }
}
