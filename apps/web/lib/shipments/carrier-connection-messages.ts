import { PROVIDER_SELLER_DISPLAY_NAMES } from "@oco/core/carrier-adapter/provider-seller-display-names";

/**
 * The two sentences a seller sees when a carrier CONNECTION is the problem —
 * authentication failed, or the carrier was never connected.
 *
 * WHY THEY NAME THE PROVIDER, NOT THE SERVICE. Both messages ask the seller to
 * go and fix a connection, and `CarrierCredential` is keyed by
 * (companyId, providerKey) — the connection IS the provider. The service title
 * cannot even identify it: cdek:delivery and yataxi:next_day are both
 * «Доставка по России», so a seller told to check that would not know which of
 * two connections to open.
 *
 * WHAT WAS WRONG BEFORE: every site hardcoded «Яндекс Доставка», but
 * `CarrierAuthError` is the base class of both `YandexAuthError` and
 * `CdekAuthError`, so a CDEK failure sent the seller to a Yandex connection
 * they may not even have.
 *
 * PURE so they can be tested: these are produced in routes, which need auth,
 * Prisma and Next to run, and a seller-facing string nothing can exercise is a
 * string nobody is watching.
 *
 * THE NAMES ARE MASKED («Перевозчик №1»), which is deliberate elsewhere in the
 * product and is what makes these sentences safe to show.
 */

/**
 * The masked name for a provider, or null when we cannot name it.
 *
 * NOT providerSellerDisplayName: that helper falls back to CARRIER_REGISTRY's
 * REAL display name for any key it cannot mask, which would unmask a carrier in
 * a seller-facing sentence. And NOT a plain index: "constructor", "toString"
 * and "__proto__" are inherited members that resolve to something truthy.
 *
 * Unknown → null → the sentence names NO carrier. A wrong name is worse than
 * no name; that is the entire defect these functions remove.
 */
function maskedProviderName(providerKey: string | null | undefined): string | null {
  if (providerKey == null || providerKey.trim() === "") {
    return null;
  }
  const key = providerKey.trim();
  if (!Object.hasOwn(PROVIDER_SELLER_DISPLAY_NAMES, key)) {
    return null;
  }
  const name = PROVIDER_SELLER_DISPLAY_NAMES[key];
  return typeof name === "string" && name.trim() !== "" ? name.trim() : null;
}

/**
 * «Не удалось авторизоваться: Перевозчик №2. Проверьте подключение.»
 *
 * A COLON, not «в сервисе «X»». The masked name already contains the word
 * «перевозчик», so any frame naming the thing again would read «в сервисе
 * «Перевозчик №2»». The colon also sidesteps declension: the names are
 * nominative, and «в» would demand the prepositional case.
 */
export function carrierAuthErrorMessage(
  providerKey: string | null | undefined,
): string {
  const name = maskedProviderName(providerKey);
  return name === null
    ? "Не удалось авторизоваться у перевозчика. Проверьте подключение."
    : `Не удалось авторизоваться: ${name}. Проверьте подключение.`;
}

/**
 * «Перевозчик №2 не подключён. Подключите его в настройках, чтобы продолжить.»
 *
 * GENDER: «подключён» and «его» are masculine, and that is checked rather than
 * assumed — every masked name is «Перевозчик №N», a masculine noun, so the
 * agreement holds for all of them. A test pins that property: if a future entry
 * is feminine («Почта России»), it fails and forces the wording to be revisited
 * instead of quietly disagreeing on screen.
 */
export function carrierNotConnectedMessage(
  providerKey: string | null | undefined,
): string {
  const name = maskedProviderName(providerKey);
  return name === null
    ? "Перевозчик не подключён. Подключите его в настройках, чтобы продолжить."
    : `${name} не подключён. Подключите его в настройках, чтобы продолжить.`;
}
