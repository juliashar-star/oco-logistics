import type { CreateOrderInput } from "./types";

const DEFAULT_ASSESSED_COST_RUB = 100;

/** Собирает тело POST /orders — чистая функция для тестов. */
export function buildCreateOrderPayload(input: CreateOrderInput): Record<string, unknown> {
  const assessedCost = input.assessedCostRub ?? DEFAULT_ASSESSED_COST_RUB;

  return {
    order: {
      clientNumber: input.clientNumber,
      weight: input.weightG,
      length: input.lengthCm,
      width: input.widthCm,
      height: input.heightCm,
      providerKey: input.providerKey,
      pickupType: input.pickupType ?? 1,
      deliveryType: input.deliveryType,
      tariffId: input.tariffId,
      ...(input.pointOutId != null ? { pointOutId: input.pointOutId } : {}),
      ...(input.deliveryDate ? { deliveryDate: input.deliveryDate } : {}),
      ...(input.deliveryTimeStart ? { deliveryTimeStart: input.deliveryTimeStart } : {}),
      ...(input.deliveryTimeEnd ? { deliveryTimeEnd: input.deliveryTimeEnd } : {}),
    },
    sender: {
      countryCode: input.sender.countryCode,
      contactName: input.sender.contactName,
      phone: input.sender.phone,
      city: input.sender.city,
      ...(input.sender.companyName ? { companyName: input.sender.companyName } : {}),
      ...(input.sender.companyInn ? { companyInn: input.sender.companyInn } : {}),
      ...(input.sender.email ? { email: input.sender.email } : {}),
      ...(input.sender.addressString ? { addressString: input.sender.addressString } : {}),
    },
    recipient: {
      countryCode: input.recipient.countryCode,
      contactName: input.recipient.contactName,
      phone: input.recipient.phone,
      city: input.recipient.city,
      ...(input.recipient.addressString ? { addressString: input.recipient.addressString } : {}),
    },
    cost: {
      assessedCost,
      codCost: 0,
    },
    places: [
      {
        weight: input.weightG,
        height: input.heightCm,
        width: input.widthCm,
        length: input.lengthCm,
        items: [
          {
            description: "Посылка",
            quantity: 1,
            weight: input.weightG,
            assessedCost,
          },
        ],
      },
    ],
  };
}
