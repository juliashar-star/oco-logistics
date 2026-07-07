import { NextResponse } from "next/server";
import { CARRIER_REGISTRY, sendCarrierConnectionRequestNotification } from "@oco/core";
import { withAuth } from "@/lib/auth/with-auth";
import {
  isCarrierConnectionRequestBlocked,
  recordCarrierConnectionRequestAttempt,
} from "@/lib/auth/rate-limit";
import { fetchConnectedCarriers } from "@/lib/carrier-picker/connected-carriers";
import { prisma } from "@/lib/db";

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

    const carrier = CARRIER_REGISTRY.find((c) => c.providerKey === providerKey);
    if (!carrier) {
      return NextResponse.json({ error: "Неизвестный перевозчик" }, { status: 400 });
    }
    if (carrier.healthStatus === "discontinued") {
      return NextResponse.json(
        { error: "Этот перевозчик больше не работает" },
        { status: 400 },
      );
    }

    const connectedCarriers = await fetchConnectedCarriers(user.companyId);
    if (connectedCarriers?.includes(providerKey)) {
      return NextResponse.json(
        { error: "Этот перевозчик уже подключён" },
        { status: 400 },
      );
    }

    const existing = await prisma.carrierConnectionRequest.findUnique({
      where: { companyId_providerKey: { companyId: user.companyId, providerKey } },
    });
    if (existing) {
      return NextResponse.json({ ok: true, alreadyRequested: true });
    }

    await prisma.carrierConnectionRequest.create({
      data: { companyId: user.companyId, providerKey },
    });

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

    return NextResponse.json({ ok: true, alreadyRequested: false });
  } catch (error) {
    console.error("carrier connection request failed", error);
    return NextResponse.json(
      { error: "Не удалось отправить заявку. Попробуйте позже." },
      { status: 500 },
    );
  }
});
