import { NextResponse } from "next/server";
import { resolveOrderAdapter } from "@oco/core/carrier-adapter/order-adapters";
import { withAuth } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";
import { getCarrierCredentials } from "@/lib/shipments/get-carrier-credentials";
import { getShipmentsHandoverAct } from "@/lib/shipments/get-shipments-handover-act";
import { handoverActFilename } from "@/lib/shipments/handover-act-filename";
import { parseShipmentIds } from "@/lib/shipments/shipment-ids-request";

export const POST = withAuth(
  async (request, user) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
    }

    const shipmentIds = parseShipmentIds(body);
    if (shipmentIds == null) {
      return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
    }

    try {
      const result = await getShipmentsHandoverAct(
        { shipmentIds, companyId: user.companyId },
        {
          loadShipments: async (ids, companyId) => {
            const rows = await prisma.shipment.findMany({
              where: { id: { in: ids }, companyId },
              select: {
                id: true,
                status: true,
                providerOrderId: true,
                orderAdapterKey: true,
              },
            });
            return rows;
          },
          getCredentials: (companyId, providerKey) =>
            getCarrierCredentials(prisma, companyId, providerKey),
          resolveAdapter: resolveOrderAdapter,
        },
      );

      if (!result.ok) {
        switch (result.reason) {
          case "empty_selection":
            return NextResponse.json(
              { error: "Выберите хотя бы одно отправление" },
              { status: 400 },
            );
          case "selection_too_large":
            return NextResponse.json(
              {
                error: `Выбрано отправлений: ${result.selected}. Максимум за один акт: ${result.limit}`,
              },
              { status: 400 },
            );
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
              {
                error: `В недопустимом статусе отправлений: ${result.shipmentIds.length} — снимите их с акта`,
                shipmentIds: result.shipmentIds,
              },
              { status: 400 },
            );
          case "unsupported_service":
            return NextResponse.json(
              { error: "Акт для этой услуги недоступен" },
              { status: 400 },
            );
          case "mixed_services":
            return NextResponse.json(
              { error: "Выберите отправления одной услуги" },
              { status: 400 },
            );
          case "carrier_not_connected":
            return NextResponse.json(
              { error: "Яндекс Доставка не подключена" },
              { status: 400 },
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

      const filename = handoverActFilename(new Date());
      return new NextResponse(Buffer.from(result.document.bytes), {
        status: 200,
        headers: {
          "Content-Type": result.document.contentType,
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (error) {
      // Never forward error.message — client may interpolate provider raw body.
      console.error("[shipments/handover-act] getShipmentsHandoverAct failed", error);
      return NextResponse.json(
        { error: "Не удалось получить акт. Попробуйте позже." },
        { status: 500 },
      );
    }
  },
  { requireEmailVerified: true },
);
