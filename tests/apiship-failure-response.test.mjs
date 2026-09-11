import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  APISHIP_REFUSAL_TEXT,
  apishipFailureResponse,
} from "../apps/web/lib/apiship-failure-response.ts";

/**
 * What a seller is told when an APIShip call fails.
 *
 * The four routes that catch `ApishipError` — intervals, create, calculate,
 * points — decide nothing themselves any more; the decision is here. It was
 * first extracted with their behaviour unchanged, and the test marked PIN
 * below was written against that extraction and passed on it — reproducing
 * the leak — before it was fixed.
 */

const ROUTES = [
  "shipments/intervals",
  "shipments/create",
  "shipments/calculate",
  "shipments/points",
];

// A STAND-IN for what APIShip can put in `description`: an echo of what was
// submitted. Every value in it is invented.
const PROVIDER_ECHO =
  "Получатель Тестов Тест, +7 000 000-00-00, ул. Примерная, 1: адрес не распознан";

describe("apishipFailureResponse", () => {
  test("every route answers 502", () => {
    for (const route of ROUTES) {
      assert.equal(apishipFailureResponse({ message: "" }, route).httpStatus, 502, route);
    }
  });

  test("an empty message → the route's own refusal", () => {
    for (const route of ROUTES) {
      assert.deepEqual(
        apishipFailureResponse({ message: "", statusCode: 500 }, route).body,
        { error: APISHIP_REFUSAL_TEXT[route] },
        route,
      );
    }
  });

  test("no message at all → the route's own refusal", () => {
    for (const route of ROUTES) {
      assert.deepEqual(
        apishipFailureResponse({}, route).body,
        { error: APISHIP_REFUSAL_TEXT[route] },
        route,
      );
    }
  });

  // was PIN — passed on the unchanged extraction, which handed PROVIDER_ECHO to
  // the seller as is, and failed the moment the fix went in. INVERTED in E8.
  test("a provider message never reaches the seller — the route's own refusal instead", () => {
    for (const route of ROUTES) {
      assert.deepEqual(
        apishipFailureResponse({ message: PROVIDER_ECHO, statusCode: 422 }, route).body,
        { error: APISHIP_REFUSAL_TEXT[route] },
        route,
      );
    }
  });

  test("the server log names the route and the HTTP status", () => {
    const { serverLog } = apishipFailureResponse(
      { message: PROVIDER_ECHO, statusCode: 422 },
      "shipments/intervals",
    );
    assert.match(serverLog, /^\[shipments\/intervals\] APIShip answered HTTP 422/);
  });

  test("the server log carries nothing of the provider's message", () => {
    for (const route of ROUTES) {
      const { serverLog } = apishipFailureResponse(
        { message: PROVIDER_ECHO, statusCode: 422, code: "INVALID_ADDRESS" },
        route,
      );
      for (const fragment of ["Тестов", "+7", "Примерная", "не распознан"]) {
        assert.ok(!serverLog.includes(fragment), `${route}: ${fragment}`);
      }
    }
  });

  test("a code-like code goes to the log", () => {
    const { serverLog } = apishipFailureResponse(
      { message: PROVIDER_ECHO, statusCode: 400, code: "INVALID_ADDRESS" },
      "shipments/create",
    );
    assert.match(serverLog, /\(code INVALID_ADDRESS\)/);
  });

  test("a code that is not code-like is withheld — it comes from the provider's body too", () => {
    for (const code of ["Тестов Тест", "ivanov@example.test", "+70000000000", "not a code"]) {
      const { serverLog } = apishipFailureResponse(
        { message: "", statusCode: 400, code },
        "shipments/create",
      );
      assert.match(serverLog, /code withheld: not code-like/, code);
      assert.ok(!serverLog.includes(code), code);
    }
  });

  test("no HTTP status → the log says so instead of inventing one", () => {
    const { serverLog } = apishipFailureResponse(
      { message: "APIShip не вернул токен авторизации" },
      "shipments/points",
    );
    assert.match(serverLog, /APIShip call failed without an HTTP status/);
  });

  test("a raw reply carried in the message with no status reaches neither the seller nor the log", () => {
    // The shape client.ts builds for an unrecognised /orders/status answer.
    const raw = `APIShip /orders/status: нераспознанная форма ответа: ${JSON.stringify({
      recipient: { name: "Тестов Тест", phone: "+70000000000" },
    })}`;
    for (const route of ROUTES) {
      const mapped = apishipFailureResponse({ message: raw }, route);
      assert.equal(mapped.body.error, APISHIP_REFUSAL_TEXT[route], route);
      assert.ok(!mapped.serverLog.includes("Тестов"), route);
      assert.ok(!mapped.serverLog.includes("+70000000000"), route);
    }
  });

  test("every route has its own refusal text — KEY PRESENCE, not a fallback", () => {
    for (const route of ROUTES) {
      assert.ok(Object.prototype.hasOwnProperty.call(APISHIP_REFUSAL_TEXT, route), route);
      assert.equal(typeof APISHIP_REFUSAL_TEXT[route], "string", route);
      assert.notEqual(APISHIP_REFUSAL_TEXT[route], "", route);
    }
  });

  test("the refusal texts are the routes' own wording, character for character", () => {
    assert.deepEqual(APISHIP_REFUSAL_TEXT, {
      "shipments/intervals":
        "Не удалось получить интервалы доставки. Проверьте адреса и параметры посылки.",
      "shipments/create":
        "Не удалось создать отправление. Проверьте данные и попробуйте снова.",
      "shipments/calculate":
        "Не удалось рассчитать тарифы. Проверьте адреса и параметры посылки.",
      "shipments/points": "Не удалось получить список ПВЗ",
    });
  });
});
