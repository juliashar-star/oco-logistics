import assert from "node:assert/strict";
import test from "node:test";

import { describeSyncResult } from "../apps/web/lib/shipments/describe-sync-result.ts";

test("all zeros → exactly no new events", () => {
  assert.equal(
    describeSyncResult({
      updated: 0,
      events: 0,
      notFound: 0,
      infoFailed: 0,
      notConnected: 0,
    }),
    "Новых событий нет.",
  );
});

test("updated or events → update summary", () => {
  assert.equal(
    describeSyncResult({ updated: 2, events: 5 }),
    "Обновлено заказов: 2 · новых событий: 5.",
  );
});

test("notConnected only → does not say no new events", () => {
  const text = describeSyncResult({
    updated: 0,
    events: 0,
    notConnected: 2,
  });
  assert.equal(
    text,
    "Перевозчик не подключён — не обновлено заказов: 2.",
  );
  assert.equal(text.includes("Новых событий нет"), false);
});

test("notFound only → not found wording", () => {
  assert.equal(
    describeSyncResult({ notFound: 3 }),
    "Не найдено у перевозчика — не обновлено заказов: 3.",
  );
});

test("infoFailed only → track/link wording", () => {
  assert.equal(
    describeSyncResult({ infoFailed: 1 }),
    "Не удалось получить трек-номер и ссылку: 1.",
  );
});

test("three counters at once → order and punctuation pinned", () => {
  assert.equal(
    describeSyncResult({
      updated: 1,
      events: 2,
      notConnected: 3,
      notFound: 0,
      infoFailed: 4,
    }),
    "Обновлено заказов: 1 · новых событий: 2. Перевозчик не подключён — не обновлено заказов: 3. Не удалось получить трек-номер и ссылку: 4.",
  );
});

test("garbage input → no new events", () => {
  assert.equal(describeSyncResult(undefined), "Новых событий нет.");
  assert.equal(describeSyncResult(null), "Новых событий нет.");
  assert.equal(describeSyncResult({}), "Новых событий нет.");
  assert.equal(describeSyncResult({ updated: "3" }), "Новых событий нет.");
});
