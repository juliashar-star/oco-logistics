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
  const notConnected = readCount(source.notConnected);

  const parts: string[] = [];

  if (updated > 0 || events > 0) {
    parts.push(`Обновлено заказов: ${updated} · новых событий: ${events}`);
  }
  if (notConnected > 0) {
    parts.push(`Перевозчик не подключён — не обновлено заказов: ${notConnected}`);
  }
  if (notFound > 0) {
    parts.push(`Не найдено у перевозчика — не обновлено заказов: ${notFound}`);
  }
  if (infoFailed > 0) {
    parts.push(`Не удалось получить трек-номер и ссылку: ${infoFailed}`);
  }

  if (parts.length === 0) {
    return "Новых событий нет.";
  }

  return `${parts.join(". ")}.`;
}

function readCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
