/**
 * WHY: the route already returns notConnected and infoFailed and the
 * server logs them, but the seller saw only «Новых событий нет» — and «перевозчик не
 * подключён» is a different fact from «ничего не изменилось».
 */
export function describeSyncResult(data: unknown): string {
  const source =
    data !== null && typeof data === "object"
      ? (data as Record<string, unknown>)
      : {};

  const updated = readCount(source.updated);
  const events = readCount(source.events);
  const notFound = readCount(source.notFound);
  const infoFailed = readCount(source.infoFailed);
  const historyFailed = readCount(source.historyFailed);
  const notConnected = readCount(source.notConnected);
  const noAdapter = readCount(source.noAdapter);
  const authFailed = readCount(source.authFailed);
  const authFailedCarriers = readStringList(source.authFailedCarriers);

  const parts: string[] = [];

  if (updated > 0 || events > 0) {
    parts.push(`Обновлено заказов: ${updated} · новых событий: ${events}`);
  }
  if (notConnected > 0) {
    parts.push(`Перевозчик не подключён — не обновлено заказов: ${notConnected}`);
  }
  if (noAdapter > 0) {
    parts.push(
      `Обновление статуса для этой услуги ещё не поддерживается — не обновлено заказов: ${noAdapter}`,
    );
  }
  if (notFound > 0) {
    parts.push(`Не найдено у перевозчика — не обновлено заказов: ${notFound}`);
  }
  if (historyFailed > 0) {
    parts.push(`Не удалось получить историю статусов: ${historyFailed}`);
  }
  if (infoFailed > 0) {
    parts.push(`Не удалось получить трек-номер и ссылку: ${infoFailed}`);
  }
  if (authFailedCarriers.length > 0) {
    parts.push(
      authFailedCarriers
        .map(
          (name) =>
            `${name}: не удалось авторизоваться — проверьте доступы в настройках`,
        )
        .join("; "),
    );
  } else if (authFailed > 0) {
    // Names come from providerSellerDisplayName; unresolved keys are filtered
    // out. Still tell the seller something — never print providerKey.
    parts.push(
      "Не удалось авторизоваться у одного из перевозчиков — проверьте доступы в настройках",
    );
  }

  if (parts.length === 0) {
    return "Новых событий нет.";
  }

  return `${parts.join(". ")}.`;
}

function readCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is string => typeof entry === "string" && entry.length > 0,
  );
}
