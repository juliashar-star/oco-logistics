/**
 * What to tell the seller after the carrier accepted and the row was written.
 *
 * The two cases are genuinely different events: a carrier that was not connected
 * now is, versus one that already worked and whose details changed. Saying
 * «подключён» to someone who has been connected for months reads as though
 * something was re-done from scratch.
 *
 * Takes whether the carrier was connected BEFORE this submit — read before the
 * re-fetch, since the re-fetch is what turns it true.
 *
 * PURE, so the wording is testable without a network.
 */
export function connectSuccessMessage(wasConnected: boolean): string {
  return wasConnected ? "Данные обновлены." : "Перевозчик подключён.";
}
