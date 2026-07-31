import type { CarrierConfirmWarning } from "@oco/core/carrier-adapter/types";

/**
 * Seller-facing Russian for a neutral confirm warning code.
 * Never uses provider `message` text — that can echo submitted fields (PII).
 */
export function confirmWarningMessage(code: CarrierConfirmWarning): string {
  switch (code) {
    case "REQUIREMENT_UNMET":
      return "Перевозчик не смог выполнить одно из запрошенных требований — заказ создан без него.";
    case "PARCEL_MAY_NOT_FIT":
      return "Посылка может не поместиться в транспорт курьера. Проверьте габариты, пока отправление ещё у вас.";
    case "ADDRESS_NOT_FOUND":
      return "Перевозчик не нашёл адрес доставки в картах. Проверьте адрес сейчас, пока посылка ещё у вас.";
    case "ADDRESS_COORDINATE_MISMATCH":
      return "Адрес и координаты доставки не совпадают. Проверьте адрес сейчас, пока посылка ещё у вас.";
    case "UNKNOWN":
      return "Перевозчик прислал предупреждение по заказу. Проверьте детали отправления, пока посылка ещё у вас.";
  }
}
