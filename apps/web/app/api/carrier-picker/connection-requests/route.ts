import { NextResponse } from "next/server";
import {
  CARRIER_REGISTRY,
  providerSellerDisplayName,
  sendCarrierConnectionRequestNotification,
  sendCarrierIntegrationRequestSellerConfirmation,
} from "@oco/core";
import { withAuth } from "@/lib/auth/with-auth";
import {
  isCarrierConnectionRequestBlocked,
  recordCarrierConnectionRequestAttempt,
} from "@/lib/auth/rate-limit";
import { formatDateMoscow } from "@/lib/date/format-date-moscow";
import { prisma } from "@/lib/db";
import { requestCarrierConnection } from "@/lib/carriers/request-carrier-connection";

export const POST = withAuth(async (request, user) => {
  try {
    const key = user.companyId;
    if (await isCarrierConnectionRequestBlocked(key)) {
      return NextResponse.json(
        { error: "Слишком много запросов. Попробуйте позже." },
        { status: 429 },
      );
    }
    await recordCarrierConnectionRequestAttempt(key);

    const body = await request.json();
    const providerKey = String(body.providerKey ?? "").trim();

    // WHICH FIELDS AND WHICH REFUSALS is decided by the service, not here — a
    // guard living in a route is a guard no test reaches, and this one also
    // exists in the picker's markup, where anyone with a terminal walks past it.
    const result = await requestCarrierConnection(prisma, {
      companyId: user.companyId,
      providerKey,
    });

    // All four refusals answer 400, like the two that were here before: none of
    // them is a state conflict, they are all «this action does not apply».
    if (result.status === "unknown_provider") {
      return NextResponse.json({ error: "Неизвестный перевозчик" }, { status: 400 });
    }
    if (result.status === "discontinued") {
      return NextResponse.json(
        { error: "Этот перевозчик больше не работает" },
        { status: 400 },
      );
    }
    if (result.status === "already_connected") {
      return NextResponse.json(
        { error: "Этот перевозчик уже подключён" },
        { status: 400 },
      );
    }
    if (result.status === "connectable_by_oco") {
      return NextResponse.json(
        {
          error:
            "Этого перевозчика можно подключить прямо сейчас — заявка не нужна. Откройте настройки, вкладка «Подключение».",
        },
        { status: 400 },
      );
    }
    if (result.status === "already_requested") {
      return NextResponse.json({
        ok: true,
        alreadyRequested: true,
        createdAt: result.createdAt.toISOString(),
      });
    }

    const carrier = CARRIER_REGISTRY.find((c) => c.providerKey === providerKey)!;
    const created = { createdAt: result.createdAt };

    const company = await prisma.company.findUnique({ where: { id: user.companyId } });
    try {
      await sendCarrierConnectionRequestNotification(
        company?.name ?? "Неизвестная компания",
        providerKey,
        carrier.displayName,
      );
    } catch (error) {
      console.error("connection request notification failed", error);
    }

    try {
      const sellerFacingName =
        providerSellerDisplayName(providerKey) ?? carrier.displayName;
      await sendCarrierIntegrationRequestSellerConfirmation(
        user.email,
        sellerFacingName,
        formatDateMoscow(created.createdAt),
      );
    } catch (error) {
      console.error("seller integration request confirmation email failed", error);
    }

    return NextResponse.json({
      ok: true,
      alreadyRequested: false,
      createdAt: created.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("carrier connection request failed", error);
    return NextResponse.json(
      { error: "Не удалось отправить заявку. Попробуйте позже." },
      { status: 500 },
    );
  }
});
