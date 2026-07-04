import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";

export const GET = withAuth<{ id: string }>(async (_request, user, { params }) => {
  const { id } = await params;
  const shipmentId = id.trim();
  if (!shipmentId) {
    return NextResponse.json({ error: "Отправление не найдено" }, { status: 404 });
  }

  const shipment = await prisma.shipment.findFirst({
    where: {
      id: shipmentId,
      companyId: user.companyId,
    },
    select: { id: true },
  });

  if (!shipment) {
    return NextResponse.json({ error: "Отправление не найдено" }, { status: 404 });
  }

  try {
    const events = await prisma.trackingEvent.findMany({
      where: { shipmentId: shipment.id },
      orderBy: { eventAt: "asc" },
      select: {
        statusCode: true,
        statusText: true,
        eventAt: true,
      },
    });

    return NextResponse.json({
      events: events.map((event) => ({
        statusCode: event.statusCode,
        statusText: event.statusText,
        eventAt: event.eventAt.toISOString(),
      })),
    });
  } catch {
    console.error("list shipment events failed", { shipmentId: shipment.id });
    return NextResponse.json(
      { error: "Не удалось загрузить историю событий" },
      { status: 500 },
    );
  }
});
