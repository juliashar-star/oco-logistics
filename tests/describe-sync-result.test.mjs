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
      historyFailed: 0,
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

test("historyFailed only → history wording", () => {
  assert.equal(
    describeSyncResult({ historyFailed: 1 }),
    "Не удалось получить историю статусов: 1.",
  );
});

test("authFailedCarriers one → named auth wording", () => {
  assert.equal(
    describeSyncResult({ authFailedCarriers: ["Перевозчик №2"] }),
    "Перевозчик №2: не удалось авторизоваться — проверьте доступы в настройках.",
  );
});

test("authFailedCarriers two → joined with semicolon", () => {
  assert.equal(
    describeSyncResult({
      authFailedCarriers: ["Перевозчик №1", "Перевозчик №2"],
    }),
    "Перевозчик №1: не удалось авторизоваться — проверьте доступы в настройках; Перевозчик №2: не удалось авторизоваться — проверьте доступы в настройках.",
  );
});

test("authFailed with empty carriers → generic unnamed line", () => {
  assert.equal(
    describeSyncResult({ authFailed: 2, authFailedCarriers: [] }),
    "Не удалось авторизоваться у одного из перевозчиков — проверьте доступы в настройках.",
  );
});

test("authFailed with names → named lines only, no generic", () => {
  const text = describeSyncResult({
    authFailed: 2,
    authFailedCarriers: ["Перевозчик №1", "Перевозчик №2"],
  });
  assert.equal(
    text,
    "Перевозчик №1: не удалось авторизоваться — проверьте доступы в настройках; Перевозчик №2: не удалось авторизоваться — проверьте доступы в настройках.",
  );
  assert.equal(text.includes("одного из перевозчиков"), false);
});

test("authFailed 0 and no names → nothing auth-related", () => {
  assert.equal(
    describeSyncResult({ authFailed: 0, authFailedCarriers: [] }),
    "Новых событий нет.",
  );
});

test("noAdapter only → unsupported service wording", () => {
  assert.equal(
    describeSyncResult({ noAdapter: 2 }),
    "Обновление статуса для этой услуги ещё не поддерживается — не обновлено заказов: 2.",
  );
});

test("three counters at once → order and punctuation pinned", () => {
  assert.equal(
    describeSyncResult({
      updated: 1,
      events: 2,
      notConnected: 3,
      notFound: 0,
      historyFailed: 5,
      infoFailed: 4,
      authFailedCarriers: ["Перевозчик №2"],
    }),
    "Обновлено заказов: 1 · новых событий: 2. Перевозчик не подключён — не обновлено заказов: 3. Не удалось получить историю статусов: 5. Не удалось получить трек-номер и ссылку: 4. Перевозчик №2: не удалось авторизоваться — проверьте доступы в настройках.",
  );
});

test("garbage input → no new events", () => {
  assert.equal(describeSyncResult(undefined), "Новых событий нет.");
  assert.equal(describeSyncResult(null), "Новых событий нет.");
  assert.equal(describeSyncResult({}), "Новых событий нет.");
  assert.equal(describeSyncResult({ updated: "3" }), "Новых событий нет.");
});
