import { NextResponse } from "next/server";
import type { SelectionMode } from "@prisma/client";
import { ApishipError } from "@oco/apiship";
import { withAuth } from "@/lib/auth/with-auth";
import { canUseApiship } from "@/lib/apiship-client-for-company";
import { prisma } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit/log";
import { normalizeRecipientPhone } from "@/lib/phone/normalize-recipient-phone";
import { createShipment } from "@/lib/shipments/create-shipment";
import { STALE_TARIFF_QUOTES_ERROR } from "@/lib/tariff-quotes/persist-tariff-quotes";

const SELECTION_MODES = new Set<SelectionMode>(["FAST", "CHEAP", "OPTIMAL", "MANUAL"]);

export const POST = withAuth(async (request, user) => {
  const company = await prisma.company.findFirst({
    where: { id: user.companyId },
    select: {
      apishipLogin: true,
      apishipPasswordEnc: true,
      apishipConnectedAt: true,
      senderCity: true,
    },
  });

  if (!company || !canUseApiship(company)) {
    return NextResponse.json(
      { error: "APIShip не подключён. Укажите логин и пароль в настройках." },
      { status: 400 },
    );
  }

  if (!company.senderCity?.trim()) {
    return NextResponse.json(
      { error: "Укажите город отправления в настройках компании" },
      { status: 400 },
    );
  }

  try {
    const body = await request.json();
    const tariffQuoteId = String(body.tariffQuoteId ?? "").trim();
    const tariffQuoteIds = Array.isArray(body.tariffQuoteIds)
      ? body.tariffQuoteIds.map((id: unknown) => String(id).trim()).filter(Boolean)
      : [];
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
    const pointOutId = body.pointOutId != null ? Number(body.pointOutId) : undefined;
    const pvzCode = body.pvzCode != null ? String(body.pvzCode).trim() : undefined;
    const deliveryDate =
      body.deliveryDate != null ? String(body.deliveryDate).trim() || undefined : undefined;
    const deliveryTimeStart =
      body.deliveryTimeStart != null ? String(body.deliveryTimeStart).trim() || undefined : undefined;
    const deliveryTimeEnd =
      body.deliveryTimeEnd != null ? String(body.deliveryTimeEnd).trim() || undefined : undefined;

    if (!tariffQuoteId) {
      return NextResponse.json({ error: "Выберите вариант доставки" }, { status: 400 });
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

    if (pickupType === "PVZ" && (!pointOutId || pointOutId <= 0)) {
      return NextResponse.json({ error: "Выберите пункт выдачи (ПВЗ)" }, { status: 400 });
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

    const result = await createShipment({
      companyId: user.companyId,
      createdByUserId: user.userId,
      tariffQuoteId,
      tariffQuoteIds,
      category: body.category,
      weightG,
      lengthCm,
      widthCm,
      heightCm,
      destCity,
      destAddress: pickupType === "COURIER" ? destAddress : undefined,
      pointOutId: pickupType === "PVZ" ? pointOutId : undefined,
      pvzCode: body.pvzCode,
      pickupType: pickupType === "COURIER" ? "COURIER" : "PVZ",
      recipientName,
      recipientPhone: normalizedRecipientPhone.value,
      selectionMode,
      legalBasisConfirmed,
      declaredValueRub:
        body.declaredValueRub != null ? Number(body.declaredValueRub) : undefined,
      deliveryDate,
      deliveryTimeStart,
      deliveryTimeEnd,
    });

    void logAuditEvent({
      userId: user.userId,
      companyId: user.companyId,
      action: "shipment.create",
      entityType: "shipment",
      entityId: result.shipmentId,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof ApishipError) {
      return NextResponse.json(
        {
          error:
            error.message ||
            "APIShip не смог создать отправление. Проверьте данные и попробуйте снова.",
        },
        { status: 502 },
      );
    }

    if (error instanceof Error) {
      const clientErrors = [
        "Выбранный вариант доставки не найден",
        "Не все варианты тарифов найдены",
        "Вариант тарифа принадлежит другой компании",
        STALE_TARIFF_QUOTES_ERROR,
        "Подтвердите правовое основание",
        "Укажите город отправления",
      ];
      if (clientErrors.some((msg) => error.message.includes(msg))) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    console.error("create shipment failed");
    return NextResponse.json(
      { error: "Не удалось создать отправление. Попробуйте позже." },
      { status: 500 },
    );
  }
}, { requireEmailVerified: true });
