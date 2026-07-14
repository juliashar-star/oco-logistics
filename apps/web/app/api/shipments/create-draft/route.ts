import { NextResponse } from "next/server";
import type { SelectionMode } from "@prisma/client";
import { withAuth } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";
import { normalizeRecipientPhone } from "@/lib/phone/normalize-recipient-phone";
import { createDraftOrder } from "@/lib/shipments/create-draft-order";

const SELECTION_MODES = new Set<SelectionMode>(["FAST", "CHEAP", "OPTIMAL", "MANUAL"]);

export const POST = withAuth(async (request, user) => {
  try {
    const body = await request.json();
    const idempotencyKey = String(body.idempotencyKey ?? "").trim();
    const pickupType = String(body.pickupType ?? "PVZ");
    const destCity = String(body.destCity ?? "").trim();
    const destAddress = String(body.destAddress ?? "").trim();
    const recipientName = String(body.recipientName ?? "").trim();
    const recipientPhone = String(body.recipientPhone ?? "").trim();
    const selectionMode = String(body.selectionMode ?? "MANUAL") as SelectionMode;
    const legalBasisConfirmed = Boolean(body.legalBasisConfirmed);
    const weightG = Number(body.weightG);
    const lengthCm = Number(body.lengthCm);
    const widthCm = Number(body.widthCm);
    const heightCm = Number(body.heightCm);
    const pvzCode =
      body.pvzCode != null ? String(body.pvzCode).trim() || undefined : undefined;

    if (!idempotencyKey) {
      return NextResponse.json(
        { error: "Укажите ключ идемпотентности (idempotencyKey)" },
        { status: 400 },
      );
    }

    if (!destCity) {
      return NextResponse.json({ error: "Укажите город назначения" }, { status: 400 });
    }

    if (!recipientName || !recipientPhone) {
      return NextResponse.json(
        { error: "Укажите имя и телефон получателя" },
        { status: 400 },
      );
    }

    const normalizedRecipientPhone = normalizeRecipientPhone(recipientPhone);
    if (!normalizedRecipientPhone.ok) {
      return NextResponse.json({ error: normalizedRecipientPhone.error }, { status: 400 });
    }

    if (!legalBasisConfirmed) {
      return NextResponse.json(
        { error: "Подтвердите правовое основание обработки персональных данных" },
        { status: 400 },
      );
    }

    if (pickupType === "COURIER" && !destAddress) {
      return NextResponse.json(
        { error: "Укажите полный адрес доставки для курьера" },
        { status: 400 },
      );
    }

    if (!weightG || weightG <= 0) {
      return NextResponse.json({ error: "Вес должен быть больше 0" }, { status: 400 });
    }

    if (lengthCm <= 0 || widthCm <= 0 || heightCm <= 0) {
      return NextResponse.json(
        { error: "Габариты должны быть больше 0" },
        { status: 400 },
      );
    }

    if (!SELECTION_MODES.has(selectionMode)) {
      return NextResponse.json({ error: "Некорректный режим выбора" }, { status: 400 });
    }

    const result = await createDraftOrder(prisma, {
      companyId: user.companyId,
      createdByUserId: user.userId,
      idempotencyKey,
      category: body.category,
      weightG,
      lengthCm,
      widthCm,
      heightCm,
      destCity,
      destAddress: pickupType === "COURIER" ? destAddress : undefined,
      pvzCode,
      pickupType: pickupType === "COURIER" ? "COURIER" : "PVZ",
      recipientName,
      recipientPhone: normalizedRecipientPhone.value,
      selectionMode,
      legalBasisConfirmed,
      declaredValueRub:
        body.declaredValueRub != null ? Number(body.declaredValueRub) : undefined,
    });

    return NextResponse.json({
      ok: true,
      created: result.created,
      shipmentId: result.shipment.id,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("Подтвердите правовое основание")) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    console.error("create draft order failed");
    return NextResponse.json(
      { error: "Не удалось создать черновик отправления. Попробуйте позже." },
      { status: 500 },
    );
  }
}, { requireEmailVerified: true });
