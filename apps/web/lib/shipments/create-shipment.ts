import type { PickupType, ProductCategory, SelectionMode } from "@prisma/client";
import { ApishipError } from "@oco/apiship";
import { prisma } from "@/lib/db";
import { getApishipClientForCompany } from "@/lib/apiship-client-for-company";
import { formatAddressForApiship, resolveSenderLocation } from "@/lib/sender-address";
import { linkTariffQuotesToShipment } from "@/lib/tariff-quotes/persist-tariff-quotes";

/**
 * Входные данные для создания отправления.
 * Используется и из UI, и (в будущем) из API/очереди — не привязывать к кнопке.
 */
export type CreateShipmentInput = {
  companyId: string;
  createdByUserId: string;
  tariffQuoteId: string;
  /** Все варианты из последнего расчёта — сохраняем в TariffQuote целиком */
  tariffQuoteIds: string[];
  category?: ProductCategory;
  weightG: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  destCity: string;
  destAddress?: string;
  pvzCode?: string;
  pointOutId?: number;
  pickupType: PickupType;
  recipientName: string;
  recipientPhone: string;
  selectionMode: SelectionMode;
  legalBasisConfirmed: boolean;
  declaredValueRub?: number;
  deliveryDate?: string;
  deliveryTimeStart?: string;
  deliveryTimeEnd?: string;
};

export type CreateShipmentResult = {
  shipmentId: string;
  trackNumber: string | null;
  apishipOrderId: string | null;
  labelUrl: string | null;
  plannedCostRub: number | null;
  plannedDeliveryDays: number | null;
};

function parseTariffId(serviceCode: string): number {
  const parts = serviceCode.split(":");
  const tariffId = Number(parts[parts.length - 1]);
  if (!tariffId || Number.isNaN(tariffId)) {
    throw new Error("Некорректный тариф в сохранённом варианте");
  }
  return tariffId;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

const FALLBACK_SENDER_PHONE = "+74950000000";

/**
 * Создание отправления в APIShip и сохранение Shipment в БД.
 */
export async function createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
  if (!input.legalBasisConfirmed) {
    throw new Error("Подтвердите правовое основание обработки персональных данных получателя");
  }

  const company = await prisma.company.findFirst({
    where: { id: input.companyId },
    select: {
      name: true,
      inn: true,
      contactEmail: true,
      senderCity: true,
      senderAddress: true,
      senderPhone: true,
    },
  });

  if (!company) {
    throw new Error("Компания не найдена");
  }

  const sender = resolveSenderLocation(company);
  if (!sender) {
    throw new Error("Укажите город отправления в настройках компании");
  }

  const selectedQuote = await prisma.tariffQuote.findFirst({
    where: {
      id: input.tariffQuoteId,
      companyId: input.companyId,
    },
    include: { carrier: true },
  });

  if (!selectedQuote) {
    throw new Error("Выбранный вариант доставки не найден");
  }

  const allQuoteIds = [...new Set([input.tariffQuoteId, ...input.tariffQuoteIds])];
  const plannedDeliveryDays =
    selectedQuote.deliveryDaysMax ?? selectedQuote.deliveryDaysMin ?? null;
  const plannedDeliveryDate =
    plannedDeliveryDays != null ? addDays(new Date(), plannedDeliveryDays) : null;

  const shipment = await prisma.shipment.create({
    data: {
      companyId: input.companyId,
      createdByUserId: input.createdByUserId,
      category: input.category ?? "OTHER",
      weightG: input.weightG,
      lengthCm: input.lengthCm,
      widthCm: input.widthCm,
      heightCm: input.heightCm,
      declaredValue:
        input.declaredValueRub != null
          ? Math.round(input.declaredValueRub * 100)
          : null,
      destCity: input.destCity.trim(),
      destAddress: input.destAddress?.trim() || null,
      pvzCode: input.pvzCode?.trim() || null,
      pickupType: input.pickupType,
      recipientName: input.recipientName.trim(),
      recipientPhone: input.recipientPhone.trim(),
      carrierId: selectedQuote.carrierId,
      selectionMode: input.selectionMode,
      serviceCode: selectedQuote.serviceCode,
      plannedCost: selectedQuote.cost,
      plannedDeliveryDays,
      plannedDeliveryDate,
      status: "DRAFT",
      legalBasisConfirmed: true,
    },
  });

  try {
    await linkTariffQuotesToShipment(input.companyId, shipment.id, allQuoteIds);
  } catch (error) {
    await prisma.shipment.delete({ where: { id: shipment.id } });
    throw error;
  }

  const providerKey = selectedQuote.carrier.apishipCode;
  const tariffId = parseTariffId(selectedQuote.serviceCode);
  const deliveryType: 1 | 2 = input.pickupType === "COURIER" ? 1 : 2;
  const recipientAddressString =
    input.pickupType === "COURIER"
      ? formatAddressForApiship(input.destCity, input.destAddress)
      : input.destCity.trim();

  const client = await getApishipClientForCompany(input.companyId);

  let apishipOrderId: string | null = null;
  let trackNumber: string | null = null;
  let labelUrl: string | null = null;

  try {
    const order = await client.createOrder({
      clientNumber: shipment.id,
      providerKey,
      tariffId,
      deliveryType,
      pickupType: 1,
      weightG: input.weightG,
      lengthCm: input.lengthCm,
      widthCm: input.widthCm,
      heightCm: input.heightCm,
      pointOutId: input.pickupType === "PVZ" ? input.pointOutId : undefined,
      assessedCostRub: input.declaredValueRub,
      sender: {
        countryCode: "RU",
        contactName: company.name,
        companyName: company.name,
        companyInn: company.inn ?? undefined,
        email: company.contactEmail,
        phone: company.senderPhone?.trim() || FALLBACK_SENDER_PHONE,
        city: sender.city,
        addressString: sender.addressString ?? sender.city,
      },
      recipient: {
        countryCode: "RU",
        contactName: input.recipientName.trim(),
        phone: input.recipientPhone.trim(),
        city: input.destCity.trim(),
        addressString: recipientAddressString,
      },
      ...(input.deliveryDate ? { deliveryDate: input.deliveryDate } : {}),
      ...(input.deliveryTimeStart ? { deliveryTimeStart: input.deliveryTimeStart } : {}),
      ...(input.deliveryTimeEnd ? { deliveryTimeEnd: input.deliveryTimeEnd } : {}),
    });

    apishipOrderId = order.orderId;
    trackNumber = await client.resolveTrackNumber(order.orderId, shipment.id);

    try {
      const labels = await client.getLabels([Number(order.orderId)]);
      labelUrl = labels.url;
    } catch {
      // Этикетка может появиться позже — не блокируем создание
    }

    await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        apishipOrderId,
        trackNumber,
        labelUrl,
        status: "CREATED",
      },
    });
  } catch (error) {
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: { status: "PROBLEM" },
    });

    if (error instanceof ApishipError) {
      throw error;
    }
    throw new Error("Не удалось создать отправление в APIShip");
  }

  return {
    shipmentId: shipment.id,
    trackNumber,
    apishipOrderId,
    labelUrl,
    plannedCostRub: selectedQuote.cost / 100,
    plannedDeliveryDays,
  };
}
