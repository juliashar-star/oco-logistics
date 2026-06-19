import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { prisma } from "@/lib/db";

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

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
}
