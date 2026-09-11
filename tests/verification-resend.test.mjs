import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  classifyVerificationSend,
  requestFailureCode,
} from "../packages/core/lib/email.ts";
import {
  failedSendMessage,
  isPriorLinkAlive,
  planAfterSend,
  PRIOR_LINK_ALIVE_TEXT,
  rollbackData,
  SEND_FAILED_TEXT,
  sendFailureServerLog,
} from "../apps/web/lib/auth/verification-send-outcome.ts";
import {
  letterCopy,
  verificationLetterState,
} from "../apps/web/lib/auth/verification-page-copy.ts";
import {
  parseResendResponse,
  RESEND_COOLDOWN_SEC,
  RESEND_FALLBACK_ERROR,
} from "../apps/web/lib/auth/parse-resend-response.ts";

/**
 * What a failed verification send does next — every decision that can be
 * reached without a database.
 *
 * `issueVerificationToken` itself is NOT tested here and cannot be yet: it
 * takes the `@oco/db` singleton and the `@/` alias, which a test outside Next
 * cannot resolve. Giving it its client as a parameter is a separate slice. What
 * it DECIDES was moved into pure modules so that this file could reach it.
 *
 * Each decision was first extracted with today's behaviour, and the tests marked
 * «was PIN» below were written against that and passed on it before anything
 * changed. They were then inverted.
 */

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date("2026-09-11T12:00:00Z");
const LIVE_PRIOR = { token: "prior-token", expiry: new Date(NOW.getTime() + HOUR_MS) };

// ── 1. Where «not sent» ends and «not established» begins

describe("classifyVerificationSend", () => {
  test("missing configuration → not_sent, naming the variables and nothing else", () => {
    const outcome = classifyVerificationSend({
      stage: "config_missing",
      missing: ["UNISENDER_GO_API_KEY"],
    });
    assert.equal(outcome.delivery, "not_sent");
    assert.match(outcome.reason, /UNISENDER_GO_API_KEY/);
  });

  test("both variables missing → both named, in one sentence", () => {
    const outcome = classifyVerificationSend({
      stage: "config_missing",
      missing: ["UNISENDER_GO_API_KEY", "UNISENDER_GO_FROM_EMAIL"],
    });
    assert.equal(outcome.delivery, "not_sent");
    assert.match(outcome.reason, /UNISENDER_GO_API_KEY and UNISENDER_GO_FROM_EMAIL are not set/);
  });

  test("HTTP 4xx → not_sent: the provider refused the request", () => {
    for (const status of [400, 401, 403, 422, 429, 499]) {
      assert.equal(
        classifyVerificationSend({ stage: "http_error", status }).delivery,
        "not_sent",
        String(status),
      );
    }
  });

  test("2xx with an API status of «error» → not_sent: the provider said so itself", () => {
    assert.equal(
      classifyVerificationSend({ stage: "api_status", status: 200, apiStatus: "error" })
        .delivery,
      "not_sent",
    );
  });

  test("2xx with any other API status → sent", () => {
    assert.deepEqual(
      classifyVerificationSend({ stage: "api_status", status: 200, apiStatus: "success" }),
      { delivery: "sent" },
    );
    assert.deepEqual(
      classifyVerificationSend({ stage: "api_status", status: 200, apiStatus: undefined }),
      { delivery: "sent" },
    );
  });

  // was PIN — passed with not_sent on today's behaviour.
  test("a failed request → unknown: the code cannot tell before-send from after-send", () => {
    const outcome = classifyVerificationSend({ stage: "request_failed", code: "ECONNRESET" });
    assert.equal(outcome.delivery, "unknown");
    assert.match(outcome.reason, /ECONNRESET/);
    assert.match(outcome.reason, /delivery not established/);
  });

  // was PIN — passed with not_sent on today's behaviour.
  test("HTTP 5xx → unknown: a gateway that gave up may have left a message accepted", () => {
    for (const status of [500, 502, 503, 504]) {
      assert.equal(
        classifyVerificationSend({ stage: "http_error", status }).delivery,
        "unknown",
        String(status),
      );
    }
  });

  test("the line between refused and not-established runs exactly between 499 and 500", () => {
    assert.equal(classifyVerificationSend({ stage: "http_error", status: 499 }).delivery, "not_sent");
    assert.equal(classifyVerificationSend({ stage: "http_error", status: 500 }).delivery, "unknown");
    // A non-2xx that is not 4xx at all is not a refusal either.
    assert.equal(classifyVerificationSend({ stage: "http_error", status: 302 }).delivery, "unknown");
  });

  // was PIN — passed with not_sent on today's behaviour.
  test("2xx with an unreadable body → unknown: the HTTP request was accepted", () => {
    assert.equal(
      classifyVerificationSend({ stage: "unreadable_body", status: 200 }).delivery,
      "unknown",
    );
  });
});

describe("requestFailureCode", () => {
  test("a code-like cause is what gets logged", () => {
    const error = new TypeError("fetch failed");
    error.cause = { code: "ECONNREFUSED" };
    assert.equal(requestFailureCode(error), "ECONNREFUSED");
  });

  test("no usable cause → the error's name, never its message", () => {
    const error = new Error("secret-looking-message-that-must-not-leak");
    assert.equal(requestFailureCode(error), "Error");
    assert.doesNotMatch(requestFailureCode(error), /secret/);
  });

  test("a cause code that does not look like a code is not trusted", () => {
    const error = new TypeError("fetch failed");
    error.cause = { code: "has spaces and a key=abc" };
    assert.equal(requestFailureCode(error), "TypeError");
  });

  test("something that is not an error at all → a fixed word", () => {
    assert.equal(requestFailureCode("a string"), "unknown");
    assert.equal(requestFailureCode(null), "unknown");
  });
});

// ── 2. What to write back, and whether to

describe("planAfterSend", () => {
  test("sent → keep", () => {
    assert.equal(planAfterSend("sent"), "keep");
  });

  test("unknown → keep: the letter may have been delivered", () => {
    assert.equal(planAfterSend("unknown"), "keep");
  });

  // was PIN — passed with «keep» on today's behaviour.
  test("not_sent → rollback: non-delivery is proven, so the previous link comes back", () => {
    assert.equal(planAfterSend("not_sent"), "rollback");
  });
});

describe("rollbackData", () => {
  test("a previous token and expiry come back as they were", () => {
    assert.deepEqual(rollbackData(LIVE_PRIOR), {
      verificationToken: "prior-token",
      verificationTokenExpiry: LIVE_PRIOR.expiry,
    });
  });

  test("a failed FIRST letter restores both columns to null", () => {
    assert.deepEqual(rollbackData({ token: null, expiry: null }), {
      verificationToken: null,
      verificationTokenExpiry: null,
    });
  });
});

// ── 3. What the seller is told on 503

describe("isPriorLinkAlive", () => {
  test("rolled back, a previous token, not expired → alive", () => {
    assert.equal(isPriorLinkAlive({ rolledBack: true, prior: LIVE_PRIOR, now: NOW }), true);
  });

  test("the rollback did not land → not alive", () => {
    assert.equal(isPriorLinkAlive({ rolledBack: false, prior: LIVE_PRIOR, now: NOW }), false);
  });

  test("there was no previous token → not alive", () => {
    assert.equal(
      isPriorLinkAlive({ rolledBack: true, prior: { token: null, expiry: null }, now: NOW }),
      false,
    );
  });

  test("the previous token had expired → not alive", () => {
    const expired = { token: "prior-token", expiry: new Date(NOW.getTime() - 1000) };
    assert.equal(isPriorLinkAlive({ rolledBack: true, prior: expired, now: NOW }), false);
  });
});

describe("failedSendMessage", () => {
  test("no live previous link → today's text, unchanged", () => {
    assert.equal(failedSendMessage(false), "Не удалось отправить письмо. Попробуйте позже.");
    assert.equal(failedSendMessage(false), SEND_FAILED_TEXT);
  });

  // was PIN — passed with SEND_FAILED_TEXT on today's behaviour.
  test("a live previous link → the seller is told the old letter still works", () => {
    assert.equal(
      failedSendMessage(true),
      "Не удалось отправить новое письмо. Ссылка из предыдущего письма по-прежнему действует.",
    );
    assert.equal(failedSendMessage(true), PRIOR_LINK_ALIVE_TEXT);
  });
});

describe("sendFailureServerLog", () => {
  test("carries the area, the reason and what became of the token", () => {
    const line = sendFailureServerLog({ reason: "HTTP 400", rollback: "done" });
    assert.match(line, /^\[auth\/verification-email\] HTTP 400; /);
    assert.match(line, /previous token was restored/);
  });

  test("each rollback outcome reads differently", () => {
    const lines = ["done", "skipped", "not_attempted"].map((rollback) =>
      sendFailureServerLog({ reason: "r", rollback }),
    );
    assert.equal(new Set(lines).size, 3);
  });

  test("a missing-configuration reason reaches the log as variable names only", () => {
    const { reason } = classifyVerificationSend({
      stage: "config_missing",
      missing: ["UNISENDER_GO_API_KEY"],
    });
    const line = sendFailureServerLog({ reason, rollback: "done" });
    assert.match(line, /UNISENDER_GO_API_KEY is not set/);
    assert.doesNotMatch(line, /=/, "a name, never a name=value pair");
  });
});

// ── 4. What the page says about the letter

describe("verificationLetterState", () => {
  test("an expiry in the column → the letter was sent", () => {
    assert.equal(verificationLetterState(new Date(NOW.getTime() + HOUR_MS)), "sent");
  });

  // was PIN — passed with «sent» on today's behaviour.
  test("no expiry → no letter is live, and the page must not claim one was sent", () => {
    assert.equal(verificationLetterState(null), "not_sent");
    assert.equal(verificationLetterState(undefined), "not_sent");
  });
});

describe("letterCopy", () => {
  test("the sent copy is today's page, word for word", () => {
    assert.deepEqual(letterCopy("sent"), {
      heading: "Проверьте почту",
      bodyBeforeEmail: "Мы отправили письмо на ",
      bodyAfterEmail: "",
      hint: "Перейдите по ссылке в письме, чтобы подтвердить email. Ссылка действует 24 часа.",
      buttonLabel: "Отправить повторно",
    });
  });

  test("the not-sent copy says so, drops the 24 hours, and offers to send", () => {
    assert.deepEqual(letterCopy("not_sent"), {
      heading: "Письмо не отправлено",
      bodyBeforeEmail: "Не удалось отправить письмо на ",
      bodyAfterEmail: ". Отправьте его ещё раз.",
      hint: null,
      buttonLabel: "Отправить письмо",
    });
  });
});

// ── 5. How the button reacts

describe("parseResendResponse", () => {
  test("200 → the full cooldown, no error", () => {
    assert.deepEqual(parseResendResponse(200, { success: true }), {
      cooldownSec: RESEND_COOLDOWN_SEC,
      error: null,
    });
  });

  test("429 with a number → exactly that countdown, and no red line", () => {
    assert.deepEqual(
      parseResendResponse(429, { error: "Подождите 42 сек. перед повторной отправкой" }),
      { cooldownSec: 42, error: null },
    );
  });

  test("429 without a number → the full cooldown AND the words", () => {
    const text = "Слишком много запросов. Попробуйте через минуту.";
    assert.deepEqual(parseResendResponse(429, { error: text }), {
      cooldownSec: RESEND_COOLDOWN_SEC,
      error: text,
    });
  });

  test("401 → the words, no cooldown", () => {
    assert.deepEqual(parseResendResponse(401, { error: "Требуется авторизация" }), {
      cooldownSec: null,
      error: "Требуется авторизация",
    });
  });

  test("a body without a string error → the fallback text", () => {
    assert.deepEqual(parseResendResponse(401, {}), {
      cooldownSec: null,
      error: RESEND_FALLBACK_ERROR,
    });
    assert.deepEqual(parseResendResponse(401, null), {
      cooldownSec: null,
      error: RESEND_FALLBACK_ERROR,
    });
  });

  // was PIN — passed with cooldownSec null on today's behaviour.
  test("503 → the words AND the full cooldown", () => {
    assert.deepEqual(parseResendResponse(503, { error: SEND_FAILED_TEXT }), {
      cooldownSec: RESEND_COOLDOWN_SEC,
      error: SEND_FAILED_TEXT,
    });
  });

  // was PIN — passed with cooldownSec null on today's behaviour.
  test("500 → the words AND the full cooldown", () => {
    assert.deepEqual(parseResendResponse(500, { error: SEND_FAILED_TEXT }), {
      cooldownSec: RESEND_COOLDOWN_SEC,
      error: SEND_FAILED_TEXT,
    });
  });

  test("the live-previous-link 503 text reaches the button unchanged", () => {
    assert.deepEqual(parseResendResponse(503, { error: PRIOR_LINK_ALIVE_TEXT }), {
      cooldownSec: RESEND_COOLDOWN_SEC,
      error: PRIOR_LINK_ALIVE_TEXT,
    });
  });
});
