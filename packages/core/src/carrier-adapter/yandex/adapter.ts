import type { CarrierAdapter } from "../types";
import {
  calculateQuotes,
  listPickupPoints,
  getOffers,
  confirmOffer,
  createOrder,
  getOrderHistory,
  getOrderInfo,
  cancelOrder,
} from "./client";

// Файл существует ради проверки контракта компилятором; createOrder у Яндекса — это request/create, заявки по нему не подтверждаются, живой путь заказа = getOffers → confirmOffer.
export const yandexAdapter = {
  providerKey: "yataxi",
  calculateQuotes,
  listPickupPoints,
  getOffers,
  confirmOffer,
  createOrder,
  getOrderHistory,
  getOrderInfo,
  cancelOrder,
} satisfies CarrierAdapter;
