import assert from "node:assert/strict";
import test from "node:test";

import {
  CREDENTIAL_FIELD_LABELS,
  connectResultToResponse,
} from "../apps/web/lib/carriers/connect-result-response.ts";
import { CARRIER_CREDENTIAL_FIELDS } from "../apps/web/lib/carriers/connect-carrier-credentials.ts";

const REJECTED_REASONS = [
  "invalid_auth",
  "invalid_source_station",
  "malformed_credentials",
];

// ── status codes, one per result case

test("stored → 200 with { ok: true } (upsert, so not 201)", () => {
  assert.deepEqual(connectResultToResponse({ status: "stored" }), {
    httpStatus: 200,
    body: { ok: true },
  });
});

test("invalid_shape → 400 naming the field in seller wording, never the raw key", () => {
  const response = connectResultToResponse({
    status: "invalid_shape",
    field: "platformStationId",
  });
  assert.equal(response.httpStatus, 400);
  assert.ok(
    response.body.error.includes(CREDENTIAL_FIELD_LABELS.platformStationId),
    "must name the field a seller can recognise",
  );
  assert.ok(
    !response.body.error.includes("platformStationId"),
    "must not leak the raw internal key",
  );
});

test("invalid_shape with an unlabelled field → 400, generic wording, raw key not echoed", () => {
  const response = connectResultToResponse({
    status: "invalid_shape",
    field: "someFutureInternalKey",
  });
  assert.equal(response.httpStatus, 400);
  assert.ok(!response.body.error.includes("someFutureInternalKey"));
});

test("unknown_provider → 400 with a message", () => {
  const response = connectResultToResponse({ status: "unknown_provider" });
  assert.equal(response.httpStatus, 400);
  assert.ok(response.body.error.length > 0);
});

test("rejected_by_carrier → 400 for every reason", () => {
  for (const reason of REJECTED_REASONS) {
    const response = connectResultToResponse({
      status: "rejected_by_carrier",
      reason,
    });
    assert.equal(response.httpStatus, 400, reason);
    assert.ok(response.body.error.length > 0, reason);
  }
});

test("carrier_unavailable → 503 (temporary; a retry is sensible)", () => {
  const response = connectResultToResponse({ status: "carrier_unavailable" });
  assert.equal(response.httpStatus, 503);
});

test("storage_not_configured → 500, and does NOT read as a temporary carrier problem", () => {
  const response = connectResultToResponse({
    status: "storage_not_configured",
  });
  assert.equal(response.httpStatus, 500);
  // Must not blame the carrier, and must not invite a naive retry.
  assert.ok(!/перевозчик/i.test(response.body.error), "must not blame the carrier");
  assert.ok(
    /не поможет|поддержку/i.test(response.body.error),
    "must say a retry will not help",
  );
});

test("carrier_unavailable and storage_not_configured differ in status AND wording", () => {
  const down = connectResultToResponse({ status: "carrier_unavailable" });
  const misconfigured = connectResultToResponse({
    status: "storage_not_configured",
  });
  assert.notEqual(down.httpStatus, misconfigured.httpStatus);
  assert.notEqual(down.body.error, misconfigured.body.error);
});

// ── wording rules

test("the wording DIFFERS for every rejection reason", () => {
  const messages = REJECTED_REASONS.map(
    (reason) =>
      connectResultToResponse({ status: "rejected_by_carrier", reason }).body
        .error,
  );
  assert.equal(
    new Set(messages).size,
    REJECTED_REASONS.length,
    "each reason must get its own sentence",
  );
});

test("invalid_source_station names the station as a PROBABLE cause, never asserts it is wrong", () => {
  const { error } = connectResultToResponse({
    status: "rejected_by_carrier",
    reason: "invalid_source_station",
  }).body;

  // Names the station…
  assert.ok(
    error.includes("точки отгрузки"),
    "must point at the station as a candidate",
  );
  // …as a possibility, not a finding.
  assert.ok(/вероятн/i.test(error), "must mark it as a probable cause");
  // A wrong station and a changed carrier requirement are indistinguishable
  // from HTTP 400 "validation_error" alone, so nothing may claim it is wrong.
  assert.ok(
    !/неверн|неправильн|ошибочн|некорректн|недействительн/i.test(error),
    `must not assert the station is wrong: ${error}`,
  );

  // The other half of the rule: because the identifier may well be CORRECT, the
  // message must leave that seller somewhere to go. Pinned by substance, not
  // phrasing — a later retry and a route to support — so a reworded but still
  // actionable message passes, while one that only says «check the id» fails.
  assert.ok(
    /попроб|повтор/i.test(error) && /позж/i.test(error),
    `must offer a later retry when the identifier is correct: ${error}`,
  );
  assert.ok(
    /поддержк/i.test(error),
    `must offer a route to support when the identifier is correct: ${error}`,
  );
});

test("invalid_auth says the carrier did not accept the credentials", () => {
  const { error } = connectResultToResponse({
    status: "rejected_by_carrier",
    reason: "invalid_auth",
  }).body;
  assert.ok(/перевозчик/i.test(error));
  assert.ok(/не принял/i.test(error));
});

// ── operator-facing log

test("storage_not_configured yields a serverLog naming the variable and the condition", () => {
  const response = connectResultToResponse({ status: "storage_not_configured" });
  assert.equal(typeof response.serverLog, "string");
  assert.ok(
    response.serverLog.includes("CARRIER_CREDENTIALS_ENCRYPTION_KEY"),
    "an operator must be able to act on it",
  );
  assert.ok(
    /missing|shorter/.test(response.serverLog),
    "must state what is wrong with it",
  );
});

test("every other result yields NO serverLog", () => {
  const others = [
    { status: "stored" },
    { status: "invalid_shape", field: "token" },
    { status: "unknown_provider" },
    ...REJECTED_REASONS.map((reason) => ({
      status: "rejected_by_carrier",
      reason,
    })),
    { status: "carrier_unavailable" },
  ];
  for (const result of others) {
    assert.equal(
      connectResultToResponse(result).serverLog,
      undefined,
      `${result.status} must not log`,
    );
  }
});

// ── nothing caller-supplied travels in a body or a log

const NEEDLE = "NEEDLE-7f3a9c-DO-NOT-ECHO";

/**
 * Every result case, with the free-form slots it carries. `status` and `reason`
 * are CLOSED selectors chosen by the service — they pick a branch and are not
 * caller-supplied text. `field` is the one free-form slot in the union today;
 * the anti-vacuity assertion below fails if that ever stops being true.
 */
const RESULT_CASES = [
  { label: "stored", result: { status: "stored" }, slots: [] },
  {
    label: "invalid_shape",
    result: { status: "invalid_shape", field: "token" },
    slots: ["field"],
  },
  { label: "unknown_provider", result: { status: "unknown_provider" }, slots: [] },
  ...REJECTED_REASONS.map((reason) => ({
    label: `rejected_by_carrier/${reason}`,
    result: { status: "rejected_by_carrier", reason },
    slots: [],
  })),
  {
    label: "carrier_unavailable",
    result: { status: "carrier_unavailable" },
    slots: [],
  },
  {
    label: "storage_not_configured",
    result: { status: "storage_not_configured" },
    slots: [],
  },
];

test("caller-supplied text never reaches the body or serverLog, on any result case", () => {
  let planted = 0;

  for (const { label, result, slots } of RESULT_CASES) {
    const withNeedles = { ...result };
    for (const slot of slots) {
      withNeedles[slot] = `${NEEDLE}-${slot}`;
      planted += 1;
    }

    const response = connectResultToResponse(withNeedles);
    const serialized = JSON.stringify({
      body: response.body,
      serverLog: response.serverLog,
    });

    assert.ok(
      !serialized.includes(NEEDLE),
      `${label} echoed caller-supplied text: ${serialized}`,
    );
    // Not vacuous: each case must still produce a real answer.
    assert.ok(
      "ok" in response.body || (response.body.error ?? "").length > 0,
      `${label} produced no message`,
    );
  }

  // Guard the guard: if the union ever loses its free-form slots (or this table
  // stops listing them) the loop above would pass without testing anything.
  assert.ok(planted > 0, "no needle was planted — this test would prove nothing");
});

// ── drift: a newly required field must not silently lose its label

test("DRIFT GUARD: every field the service requires has a seller-facing label", () => {
  for (const [providerKey, spec] of Object.entries(CARRIER_CREDENTIAL_FIELDS)) {
    for (const field of spec) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(
          CREDENTIAL_FIELD_LABELS,
          field.name,
        ),
        `${providerKey}.${field.name} has no label — its 400 would fall back to generic wording`,
      );
    }
  }
});
