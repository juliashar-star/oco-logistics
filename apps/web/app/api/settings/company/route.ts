import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/with-auth";
import { prisma } from "@/lib/db";
import { loadSellerReadiness } from "@/lib/load-seller-readiness";
import { isSenderConfigured } from "@/lib/seller-readiness";
import { normalizeRuPhone } from "@/lib/phone/ru-phone";
import {
  OFFER_PRIORITY_INVALID_RU,
  parseOfferPriority,
} from "@/lib/settings/parse-offer-priority";

const companySettingsSchema = z.object({
  senderCity: z.string().trim().min(1, "Укажите город отправления"),
  senderAddress: z.string().trim().optional().default(""),
  senderPhone: z.string().trim().optional().default(""),
});

export const GET = withAuth(async (request, user) => {
  const company = await prisma.company.findFirst({
    where: { id: user.companyId },
    select: {
      name: true,
      senderCity: true,
      senderAddress: true,
      senderPhone: true,
      defaultOfferPriority: true,
    },
  });

  if (!company) {
    return NextResponse.json({ error: "Компания не найдена" }, { status: 404 });
  }

  const senderCity = company.senderCity?.trim() ?? "";
  const senderAddress = company.senderAddress?.trim() ?? "";
  const senderPhone = company.senderPhone?.trim() ?? "";

  // Served from here because the new-order form already fetches this route on
  // mount — the check it needs costs no extra round-trip.
  const readiness = await loadSellerReadiness(prisma, {
    companyId: user.companyId,
    emailVerified: user.emailVerified,
    senderCity,
    senderPhone,
  });

  return NextResponse.json({
    name: company.name,
    senderCity,
    senderAddress,
    senderPhone,
    // NOW CITY **AND** PHONE, from the one rule in seller-readiness.ts. It used
    // to be `Boolean(senderCity)`, which let a company with no phone read as
    // configured and then be refused at the quote by build-offer-input.ts. Both
    // banners that show this field become truthful rather than broken: the green
    // one promises the address «подставляется в расчёт тарифов», and without a
    // phone that promise was false.
    senderConfigured: readiness.senderConfigured,
    // null is a real answer here, not a missing field: it means the seller has
    // not chosen, and the form renders «Ничего не подставлять».
    defaultOfferPriority: company.defaultOfferPriority ?? null,
    readiness,
  });
});

export const POST = withAuth(async (request, user) => {
  try {
    const body = await request.json();
    const parsed = companySettingsSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.errors[0]?.message ?? "Некорректные данные";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { senderCity, senderAddress, senderPhone: senderPhoneRaw } = parsed.data;

    // Parsed by a pure function, not by a branch here — see parse-offer-priority.
    // It is given the WHOLE body, because «the key was absent» is one of its
    // answers and a bare value cannot express it.
    const priority = parseOfferPriority(body);
    if (!priority.ok) {
      return NextResponse.json(
        { error: OFFER_PRIORITY_INVALID_RU },
        { status: 400 },
      );
    }

    let senderPhone: string | null = null;
    if (senderPhoneRaw) {
      const normalized = normalizeRuPhone(senderPhoneRaw);
      if (!normalized.ok) {
        return NextResponse.json({ error: normalized.error }, { status: 400 });
      }
      senderPhone = normalized.value || null;
    }

    await prisma.company.updateMany({
      where: { id: user.companyId },
      data: {
        senderCity,
        senderAddress: senderAddress || null,
        senderPhone,
        // Spread, not a value: an absent key must leave the column alone, and
        // Prisma treats a present `undefined` as «no change» only by accident
        // of its API. Omitting the property says it outright.
        ...(priority.present
          ? { defaultOfferPriority: priority.value }
          : {}),
      },
    });

    // Read back rather than echo the request: when the key was absent we did
    // not touch the column, so the request cannot say what it now holds, and
    // echoing «null» would tell the form the preference was cleared when it
    // was not.
    const saved = await prisma.company.findFirst({
      where: { id: user.companyId },
      select: { defaultOfferPriority: true },
    });

    return NextResponse.json({
      ok: true,
      senderCity,
      senderAddress,
      senderPhone: senderPhone ?? "",
      // COMPUTED, not hardcoded `true`. A save that stores a city and no phone
      // does not make the sender configured under the city-AND-phone rule, and
      // saying it does would put the green banner on a company the quote will
      // refuse. Only the two sender fields are judged here — the counts belong
      // to GET, and a save cannot have changed them.
      senderConfigured: isSenderConfigured(senderCity, senderPhone),
      defaultOfferPriority: saved?.defaultOfferPriority ?? null,
    });
  } catch {
    console.error("company settings save failed");
    return NextResponse.json(
      { error: "Не удалось сохранить профиль компании" },
      { status: 500 },
    );
  }
});
