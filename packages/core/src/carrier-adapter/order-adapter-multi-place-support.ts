/**
 * Which order-adapter keys can carry MORE THAN ONE place in a single order.
 * Client-safe — MUST NOT import order-adapters (Node builtins → browser bundle).
 * Drift-tested in Node against ORDER_ADAPTERS for every registry key.
 *
 * UNLIKE order-adapter-label-support, an unknown key answers FALSE rather than
 * falling back to the default adapter's value. Reason: «we have not measured
 * this adapter» must never read as «this adapter takes several boxes» — a wrong
 * true would send a multi-place order to a carrier that cannot express one.
 */

// Кто умеет несколько грузомест в ОДНОМ заказе.
// cdek:delivery — ДА. Приложение №3 к Регламенту, п. 3.3: соединять несколько
//   грузомест и отправлять как одно ЗАПРЕЩЕНО, требуется многоместный заказ;
//   п. 4.1 требует маркировку на каждом месте.
// yataxi:express, yataxi:courier — НЕТ. У claims/* понятия места нет вовсе:
//   в теле только items, второго уровня вложенности не существует.
// yataxi:next_day — НЕТ ДО ИЗМЕРЕНИЯ. В Условиях и оферте Яндекса о количестве
//   мест не сказано ничего (0 совпадений, проверено 07.09.2026), а тело
//   request/create шлёт places из одного элемента. Ставим false не потому,
//   что перевозчик не умеет, а потому что мы не измерили. Закрывается
//   read-only пробой.
export const ORDER_ADAPTER_MULTI_PLACE_SUPPORT: Readonly<
  Record<string, boolean>
> = {
  "cdek:delivery": true,
  "yataxi:next_day": false,
  "yataxi:express": false,
  "yataxi:courier": false,
};

/**
 * Null/empty/unknown key → false. See the note above on why this does NOT
 * mirror orderAdapterSupportsLabel's fallback to the default entry.
 */
export function orderAdapterSupportsMultiPlace(
  adapterKey: string | null | undefined,
): boolean {
  if (adapterKey == null || adapterKey === "") {
    return false;
  }
  // OWN keys only — see orderAdapterSupportsLabel. A prototype member is truthy,
  // so an unguarded index would report «takes several boxes» for a key that is
  // not an adapter at all.
  const found = Object.prototype.hasOwnProperty.call(
    ORDER_ADAPTER_MULTI_PLACE_SUPPORT,
    adapterKey,
  )
    ? ORDER_ADAPTER_MULTI_PLACE_SUPPORT[adapterKey]
    : undefined;
  if (found === undefined) {
    console.error(
      "[order-adapter-multi-place-support] UNKNOWN_ORDER_ADAPTER_KEY",
      JSON.stringify({ adapterKey }),
    );
    return false;
  }
  return found;
}
