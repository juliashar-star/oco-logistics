import { NextResponse } from "next/server";
import { isKnownPickupPointProviderKey } from "@oco/core/carrier-adapter/pickup-point-adapters";
import { withAuth } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";
import { normalizeRecipientPhone } from "@/lib/phone/normalize-recipient-phone";
import { createDraftOrder } from "@/lib/shipments/create-draft-order";
import { parcelEntryCeilingError } from "@/lib/shipments/format-parcel-entry-summary";

export const POST = withAuth(async (request, user) => {
  try {
    const body = await request.json();
    const idempotencyKey = String(body.idempotencyKey ?? "").trim();
    const pickupType = String(body.pickupType ?? "PVZ");
    const destCity = String(body.destCity ?? "").trim();
    const destAddress = String(body.destAddress ?? "").trim();
    const destApartment = String(body.destApartment ?? "").trim() || undefined;
    const deliveryComment = String(body.deliveryComment ?? "").trim() || undefined;
    const recipientName = String(body.recipientName ?? "").trim();
    const recipientPhone = String(body.recipientPhone ?? "").trim();
    // selectionMode is NOT read here. A draft is created BEFORE the offers
    // exist, so nothing has been chosen and no rule has run: any value sent at
    // this point could only describe the previous quote, and `draftFields`
    // below rewrites the whole row on every re-quote, so it would overwrite a
    // correct value with a stale one. The mode arrives on the submit request.
    const legalBasisConfirmed = Boolean(body.legalBasisConfirmed);
    if (
      "needsThermalBag" in body &&
      typeof body.needsThermalBag !== "boolean"
    ) {
      return NextResponse.json(
        { error: "needsThermalBag должен быть boolean" },
        { status: 400 },
      );
    }
    const needsThermalBag = body.needsThermalBag === true;
    if (
      "handoverMode" in body &&
      body.handoverMode !== "COURIER" &&
      body.handoverMode !== "DROP_OFF"
    ) {
      return NextResponse.json(
        { error: "Некорректный способ передачи отправления" },
        { status: 400 },
      );
    }
    const handoverMode =
      body.handoverMode === "COURIER" ? "COURIER" : "DROP_OFF";
    // Membership via isKnownPickupPointProviderKey (OWN keys of
    // PICKUP_POINT_ADAPTERS only) — a point's carrier must be one that can list
    // points. Do not check whether that carrier is CONNECTED: the offers
    // fan-out already intersects with the company's credentials, and
    // re-querying here would add a database round trip to every re-quote.
    // Absent or empty/whitespace → null (form sends "" when no point is chosen).
    let pvzProviderKey: string | undefined;
    if ("pvzProviderKey" in body) {
      if (typeof body.pvzProviderKey !== "string") {
        return NextResponse.json(
          { error: "Некорректный перевозчик пункта выдачи" },
          { status: 400 },
        );
      }
      const trimmed = body.pvzProviderKey.trim();
      if (trimmed !== "") {
        if (!isKnownPickupPointProviderKey(trimmed)) {
          return NextResponse.json(
            { error: "Некорректный перевозчик пункта выдачи" },
            { status: 400 },
          );
        }
        pvzProviderKey = trimmed;
      }
    }
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

    // Data-entry sanity ceiling only — not a carrier limit. See
    // format-parcel-entry-summary.ts (RAISE if Грузовой / multi-tonne is added).
    const ceilingError = parcelEntryCeilingError(
      weightG,
      lengthCm,
      widthCm,
      heightCm,
    );
    if (ceilingError) {
      return NextResponse.json({ error: ceilingError }, { status: 400 });
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
      destApartment: pickupType === "COURIER" ? destApartment : undefined,
      deliveryComment: pickupType === "COURIER" ? deliveryComment : undefined,
      pvzCode,
      pvzProviderKey,
      pickupType: pickupType === "COURIER" ? "COURIER" : "PVZ",
      handoverMode,
      recipientName,
      recipientPhone: normalizedRecipientPhone.value,
      legalBasisConfirmed,
      needsThermalBag,
      declaredValueRub:
        body.declaredValueRub != null ? Number(body.declaredValueRub) : undefined,
    });

    if ("conflict" in result) {
      return NextResponse.json(
        {
          error:
            "Этот черновик уже отправляется или оформлен — перезагрузите страницу и создайте новый заказ",
        },
        { status: 409 },
      );
    }

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
