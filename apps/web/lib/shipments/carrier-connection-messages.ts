import {
  CARRIER_CABINET_NAME_FALLBACK,
  carrierCabinetName,
} from "@oco/core/carrier-adapter/carrier-cabinet-names";

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
 * THE NAMES ARE THE CARRIERS' REAL ONES (decided 18.08): these sentences are
 * shown in the cabinet, to a seller acting on their own connection. Masking is
 * a secrecy measure and lives on the public site.
 */

/**
 * The carrier's real name for a provider key, or null when we cannot name it.
 *
 * WAS MASKED UNTIL 18.08. These sentences live in the cabinet, where the
 * decision is now to name the carrier the seller connected themselves; masking
 * remains a secrecy measure for the public site only.
 *
 * Unknown key → null → the sentence names NO carrier. A wrong name is worse
 * than no name; that is the defect these functions were written to remove, and
 * it is unchanged by which vocabulary the names come from.
 */
function carrierNameForMessage(
  providerKey: string | null | undefined,
): string | null {
  if (providerKey == null || providerKey.trim() === "") {
    return null;
  }
  const key = providerKey.trim();
  const name = carrierCabinetName(key);
  return name === CARRIER_CABINET_NAME_FALLBACK ? null : name;
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
  const name = carrierNameForMessage(providerKey);
  return name === null
    ? "Не удалось авторизоваться у перевозчика. Проверьте подключение."
    : `Не удалось авторизоваться: ${name}. Проверьте подключение.`;
}

/**
 * «Перевозчик №2 не подключён. Подключите его в настройках, чтобы продолжить.»
 *
 * NO GENDER AGREEMENT LEFT IN THIS SENTENCE, and that is the rewrite. The old
 * wording «X не подключён … подключите ЕГО» was masculine, which was safe only
 * while every name was «Перевозчик №N». Real names share no gender: «СДЭК»,
 * «Яндекс Доставка» (feminine), «Dostavista» (Latin script). The name now
 * stands first in the nominative, then an em dash and a nominal phrase that
 * agrees with nothing, and the imperative names «перевозчика» instead of a
 * pronoun that would have to match.
 */
export function carrierNotConnectedMessage(
  providerKey: string | null | undefined,
): string {
  const name = carrierNameForMessage(providerKey);
  return name === null
    ? "Перевозчик не подключён. Подключите его в настройках, чтобы продолжить."
    : `${name} — нет подключения. Подключите перевозчика в настройках, чтобы продолжить.`;
}
