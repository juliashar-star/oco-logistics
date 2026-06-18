import type { DeliveryQuote } from "@oco/apiship";
import type { PickupType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type PersistTariffQuotesInput = {
  companyId: string;
  quotes: DeliveryQuote[];
  rawResponse: unknown;
  shipmentId?: string;
};

export type PersistedTariffQuote = {
  id: string;
  providerKey: string;
  tariffId: number;
  deliveryMode: DeliveryQuote["deliveryMode"];
  serviceCode: string;
};

function pickupTypeFromMode(mode: DeliveryQuote["deliveryMode"]): PickupType {
  return mode === "door" ? "COURIER" : "PVZ";
}

function serviceCodeFor(quote: DeliveryQuote): string {
  return `${quote.providerKey}:${quote.tariffId}`;
}

function rawResponseForQuote(
  quote: DeliveryQuote,
  calculatorResponse: unknown,
): Prisma.InputJsonValue {
  return {
    variant: quote.rawVariant ?? null,
    calculator: calculatorResponse,
  } as Prisma.InputJsonValue;
}

async function ensureCarrier(providerKey: string): Promise<string> {
  const apishipCode = providerKey.toLowerCase();
  const carrier = await prisma.carrier.upsert({
    where: { apishipCode },
    create: {
      apishipCode,
      name: providerKey.toUpperCase(),
      isActive: true,
    },
    update: {},
  });
  return carrier.id;
}

/**
 * Сохраняет все варианты расчёта в TariffQuote вместе с полным ответом APIShip.
 * Ничего не отбрасываем — каждая строка хранит variant + calculator.
 */
export async function persistTariffQuotes(
  input: PersistTariffQuotesInput,
): Promise<PersistedTariffQuote[]> {
  const saved: PersistedTariffQuote[] = [];

  for (const quote of input.quotes) {
    const carrierId = await ensureCarrier(quote.providerKey);
    const serviceCode = serviceCodeFor(quote);
    const costKopecks = Math.round(quote.deliveryCostRub * 100);

    const row = await prisma.tariffQuote.create({
      data: {
        companyId: input.companyId,
        shipmentId: input.shipmentId ?? null,
        carrierId,
        serviceCode,
        cost: costKopecks,
        deliveryDaysMin: quote.deliveryDaysMin,
        deliveryDaysMax: quote.deliveryDaysMax,
        pickupType: pickupTypeFromMode(quote.deliveryMode),
        rawResponse: rawResponseForQuote(quote, input.rawResponse),
      },
      select: { id: true },
    });

    saved.push({
      id: row.id,
      providerKey: quote.providerKey,
      tariffId: quote.tariffId,
      deliveryMode: quote.deliveryMode,
      serviceCode,
    });
  }

  return saved;
}

/** Сообщение, если варианты расчёта уже привязаны к другому отправлению. */
export const STALE_TARIFF_QUOTES_ERROR = "Сделайте новый расчёт тарифов";
export async function linkTariffQuotesToShipment(
  companyId: string,
  shipmentId: string,
  quoteIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(quoteIds)];
  if (uniqueIds.length === 0) {
    return;
  }

  const quotes = await prisma.tariffQuote.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, companyId: true, shipmentId: true },
  });

  if (quotes.length !== uniqueIds.length) {
    throw new Error("Не все варианты тарифов найдены");
  }

  for (const quote of quotes) {
    if (quote.companyId !== companyId) {
      throw new Error("Вариант тарифа принадлежит другой компании");
    }
    if (quote.shipmentId && quote.shipmentId !== shipmentId) {
      throw new Error(STALE_TARIFF_QUOTES_ERROR);
    }
  }

  await prisma.tariffQuote.updateMany({
    where: {
      id: { in: uniqueIds },
      companyId,
      OR: [{ shipmentId: null }, { shipmentId }],
    },
    data: { shipmentId },
  });
}
