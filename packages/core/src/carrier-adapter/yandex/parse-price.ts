export function parseRublePrice(raw: string): number {
  const match = raw.trim().match(/^(\d+(\.\d+)?)\s*RUB$/);
  if (!match) {
    throw new Error(`Unrecognized price format from Yandex Delivery: "${raw}"`);
  }
  return Number(match[1]);
}
