import { NextResponse } from "next/server";
import { resolveOrderAdapter } from "@oco/core/carrier-adapter/order-adapters";
import { withAuth } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";
import { getCarrierCredentials } from "@/lib/shipments/get-carrier-credentials";
import { getShipmentLabel } from "@/lib/shipments/get-shipment-label";

function labelFilename(shipmentId: string): string {
  return `label-${shipmentId}.pdf`;
}

export const GET = withAuth<{ id: string }>(
  async (_request, user, { params }) => {
    const { id } = await params;
    const shipmentId = id.trim();
    if (!shipmentId) {
      return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    }

    try {
      const result = await getShipmentLabel(
        { shipmentId, companyId: user.companyId },
        {
          loadShipment: async (id, companyId) => {
            const row = await prisma.shipment.findFirst({
              where: { id, companyId },
              select: {
                id: true,
                status: true,
                providerOrderId: true,
                orderAdapterKey: true,
              },
            });
            return row;
          },
          getCredentials: (companyId, providerKey) =>
            getCarrierCredentials(prisma, companyId, providerKey),
          resolveAdapter: resolveOrderAdapter,
        },
      );

      if (!result.ok) {
        switch (result.reason) {
          case "not_found":
            return NextResponse.json(
              { error: "Заказ не найден" },
              { status: 404 },
            );
          case "no_carrier_order":
            return NextResponse.json(
              { error: "Заказ ещё не создан у перевозчика" },
              { status: 400 },
            );
          case "not_allowed_for_status":
            return NextResponse.json(
              { error: "Этикетка для этого статуса недоступна" },
              { status: 409 },
            );
          case "unsupported_service":
            return NextResponse.json(
              { error: "Этикетка для этой услуги недоступна" },
              { status: 400 },
            );
          case "carrier_not_connected":
            return NextResponse.json(
              { error: "Яндекс Доставка не подключена" },
              { status: 400 },
            );
          case "not_ready":
            return NextResponse.json(
              { error: "Этикетка пока недоступна" },
              { status: 409 },
            );
          case "carrier_auth":
            return NextResponse.json(
              {
                error:
                  "Не удалось авторизоваться в Яндекс Доставке. Проверьте подключение.",
              },
              { status: 400 },
            );
        }
      }

      return new NextResponse(Buffer.from(result.document.bytes), {
        status: 200,
        headers: {
          "Content-Type": result.document.contentType,
          "Content-Disposition": `attachment; filename="${labelFilename(shipmentId)}"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (error) {
      console.error("[shipments/label] getShipmentLabel failed", error);
      return NextResponse.json(
        { error: "Не удалось получить этикетку. Попробуйте позже." },
        { status: 500 },
      );
    }
  },
  { requireEmailVerified: true },
);
