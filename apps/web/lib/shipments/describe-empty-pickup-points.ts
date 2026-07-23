import type { CarrierDto } from "./pickup-point-dto";

/**
 * WHY: listPickupPointsForCompany already puts the real cause in carriers[].status
 * (failed / city_not_resolved / ok+resolved city / no_adapter / none connected).
 * Treating every empty points[] as a mistyped city name lies to the seller when
 * the carrier simply failed.
 */
export function describeEmptyPickupPoints(carriers: unknown): string {
  if (!Array.isArray(carriers) || carriers.length === 0) {
    return "Не подключён ни один перевозчик — подключите перевозчика в настройках";
  }

  const entries = carriers as CarrierDto[];

  if (entries.some((entry) => entry?.status === "failed")) {
    return "Не удалось получить пункты выдачи от перевозчика. Попробуйте позже";
  }

  const okWithCity = entries.find((entry) => {
    if (entry?.status !== "ok") {
      return false;
    }
    const address = entry.resolvedLocation?.address;
    return typeof address === "string" && address.trim() !== "";
  });
  if (okWithCity?.resolvedLocation?.address) {
    return `В городе «${okWithCity.resolvedLocation.address}» пунктов выдачи не найдено`;
  }

  if (entries.some((entry) => entry?.status === "city_not_resolved")) {
    return "Не удалось распознать город — проверьте название";
  }

  if (entries.every((entry) => entry?.status === "no_adapter")) {
    return "Для подключённого перевозчика список ПВЗ пока недоступен";
  }

  return "Не найдено пунктов выдачи в этом городе";
}
