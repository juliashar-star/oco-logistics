import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import {
  issueVerificationToken,
  VERIFICATION_TOKEN_TTL_MS,
} from "../../apps/web/lib/auth/verification.ts";
import { getTestPrisma, truncateAll } from "../helpers/test-db.mjs";

/**
 * THE FIRST TESTS ON ISSUING A VERIFICATION TOKEN — recorded as open in
 * docs/ROADMAP.md: «сам выпуск токена — `issueVerificationToken` … не вызывает
 * ни один тест», and in docs/DECISIONS.md 2026-09-11 (2): the conditional
 * rollback was covered by nothing.
 *
 * `issueVerificationToken` takes its client as the first argument, so it runs
 * here against the test database. The letter is not sent: `email.ts` imports
 * nothing and reaches the provider through the global `fetch`, so `fetch` is
 * replaced — the same form the carrier tests use — and restored after each case.
 *
 * The mail variables are set to stand-in values for every case and restored
 * afterwards, through the `withEnv` form of tests/yandex-get-order-info.test.mjs.
 * Nothing reads or writes `.env`, and a real key that happens to be in the
 * process never reaches the replaced `fetch` — nor, through it, a failure
 * message.
 *
 * ORDER OF ASSERTIONS, in cases 2–7: the state of the COLUMNS is checked first,
 * and the function's answer — `priorLinkAlive`, the log line — after it. The
 * columns are what the seller is left with; the answer is what we say about
 * it, and the second is worth nothing without the first. Checked the other way
 * round, a breakage fails on the answer and the columns are never looked at.
 */

/** @type {import("@prisma/client").PrismaClient} */
let prisma;

beforeEach(async () => {
  prisma = getTestPrisma();
  await truncateAll(prisma);
});

afterEach(async () => {
  await truncateAll(prisma);
});

let seq = 0;

function fresh(label) {
  seq += 1;
  return `${label}-${Date.now()}-${seq}`;
}

const HOUR_MS = 60 * 60 * 1000;
const STAND_IN_API_KEY = "stand-in-key-not-real";
const STAND_IN_FROM_EMAIL = "noreply@example.test";

function setEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

async function withEnv(name, value, run) {
  const saved = process.env[name];
  setEnv(name, value);
  try {
    return await run();
  } finally {
    setEnv(name, saved);
  }
}

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      return body;
    },
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  };
}

/** A 2xx whose body is not JSON: `response.json()` rejects, as it would. */
function unreadableResponse(status) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      throw new SyntaxError("Unexpected token < in JSON at position 0");
    },
    async text() {
      return "<html>not json</html>";
    },
  };
}

function installFetchMock(handler) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return handler({ url, init, calls });
  };
  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

/** A user holding `token` (or none), expiring `expiresInMs` from now. */
async function seedUser({ token, expiresInMs = HOUR_MS }) {
  const company = await prisma.company.create({
    data: { name: "Issue token test", contactEmail: `${fresh("co")}@example.test` },
  });
  return prisma.user.create({
    data: {
      companyId: company.id,
      email: `${fresh("user")}@example.test`,
      passwordHash: "not-a-real-hash",
      emailVerified: false,
      verificationToken: token,
      verificationTokenExpiry:
        token === null ? null : new Date(Date.now() + expiresInMs),
    },
  });
}

function reread(id) {
  return prisma.user.findUnique({
    where: { id },
    select: { verificationToken: true, verificationTokenExpiry: true },
  });
}

/**
 * Runs `issueVerificationToken` with `fetch` answered by `handler` and the mail
 * variables set as given (`undefined` removes one). Everything is restored.
 */
async function issue(user, handler, env = {}) {
  const apiKey = "apiKey" in env ? env.apiKey : STAND_IN_API_KEY;
  const fromEmail = "fromEmail" in env ? env.fromEmail : STAND_IN_FROM_EMAIL;
  return withEnv("UNISENDER_GO_API_KEY", apiKey, () =>
    withEnv("UNISENDER_GO_FROM_EMAIL", fromEmail, async () => {
      const mock = installFetchMock(handler);
      try {
        const result = await issueVerificationToken(prisma, user.id, user.email);
        return { result, calls: mock.calls };
      } finally {
        mock.restore();
      }
    }),
  );
}

/** The token the letter carried, read from the request body — never a header. */
function tokenInLetter(call, token) {
  return String(call.init.body).includes(token);
}

describe("issueVerificationToken", { concurrency: false }, () => {
  // ── delivered

  test("1 · a delivered letter → the new token and expiry are written, and the outcome is «sent»", async () => {
    const priorToken = fresh("prior");
    const user = await seedUser({ token: priorToken });

    const startedAt = Date.now();
    const { result, calls } = await issue(user, () =>
      jsonResponse(200, { status: "success" }),
    );
    const finishedAt = Date.now();
    const after = await reread(user.id);

    assert.deepEqual(result, { outcome: "sent" });
    assert.notEqual(after.verificationToken, null);
    assert.notEqual(after.verificationToken, priorToken, "a NEW token was written");
    assert.equal(calls.length, 1);
    assert.ok(
      tokenInLetter(calls[0], after.verificationToken),
      "the letter carries the token that is in the column",
    );
    const expiry = after.verificationTokenExpiry.getTime();
    assert.ok(
      expiry >= startedAt + VERIFICATION_TOKEN_TTL_MS &&
        expiry <= finishedAt + VERIFICATION_TOKEN_TTL_MS,
      "the expiry is the TTL from the moment of issue",
    );
  });

  // ── not sent, proven → the previous token comes back

  test("2 · the mail variables are missing → no request, and the token is ROLLED BACK", async () => {
    const priorToken = fresh("prior");
    const user = await seedUser({ token: priorToken });
    const before = await reread(user.id);

    const { result, calls } = await issue(
      user,
      () => {
        throw new Error("fetch must not be called without configuration");
      },
      { apiKey: undefined, fromEmail: undefined },
    );
    const after = await reread(user.id);

    assert.equal(after.verificationToken, priorToken);
    assert.equal(
      after.verificationTokenExpiry.getTime(),
      before.verificationTokenExpiry.getTime(),
    );
    assert.equal(calls.length, 0, "no request leaves without configuration");
    assert.equal(result.outcome, "failed");
    assert.equal(result.priorLinkAlive, true);
  });

  test("3 · HTTP 4xx → ROLLED BACK", async () => {
    const priorToken = fresh("prior");
    const user = await seedUser({ token: priorToken });
    const before = await reread(user.id);

    const { result, calls } = await issue(user, () => jsonResponse(400, {}));
    const after = await reread(user.id);

    assert.equal(after.verificationToken, priorToken);
    assert.equal(
      after.verificationTokenExpiry.getTime(),
      before.verificationTokenExpiry.getTime(),
    );
    assert.equal(calls.length, 1);
    assert.ok(!tokenInLetter(calls[0], priorToken), "the refused letter carried a NEW token");
    assert.equal(result.outcome, "failed");
    assert.equal(result.priorLinkAlive, true);
  });

  test("4 · 2xx with status «error» in the body → ROLLED BACK", async () => {
    const priorToken = fresh("prior");
    const user = await seedUser({ token: priorToken });
    const before = await reread(user.id);

    const { result } = await issue(user, () =>
      jsonResponse(200, { status: "error" }),
    );
    const after = await reread(user.id);

    assert.equal(after.verificationToken, priorToken);
    assert.equal(
      after.verificationTokenExpiry.getTime(),
      before.verificationTokenExpiry.getTime(),
    );
    assert.equal(result.outcome, "failed");
    assert.equal(result.priorLinkAlive, true);
  });

  // ── delivery not established → the new token STAYS

  test("5 · HTTP 5xx → NOT rolled back: the letter may have gone, carrying the new token", async () => {
    const priorToken = fresh("prior");
    const user = await seedUser({ token: priorToken });

    const { result, calls } = await issue(user, () => jsonResponse(503, {}));
    const after = await reread(user.id);

    assert.notEqual(after.verificationToken, priorToken);
    assert.ok(
      tokenInLetter(calls[0], after.verificationToken),
      "the column holds the token the letter may have delivered",
    );
    assert.equal(result.outcome, "failed");
    assert.equal(result.priorLinkAlive, false);
  });

  test("6 · 2xx with an unreadable body → NOT rolled back", async () => {
    const priorToken = fresh("prior");
    const user = await seedUser({ token: priorToken });

    const { result, calls } = await issue(user, () => unreadableResponse(200));
    const after = await reread(user.id);

    assert.notEqual(after.verificationToken, priorToken);
    assert.ok(tokenInLetter(calls[0], after.verificationToken));
    assert.equal(result.outcome, "failed");
    assert.equal(result.priorLinkAlive, false);
  });

  test("7 · fetch rejects → NOT rolled back, and the log names the code, not the message", async () => {
    const priorToken = fresh("prior");
    const user = await seedUser({ token: priorToken });

    const { result, calls } = await issue(user, () => {
      const error = new TypeError("fetch failed");
      error.cause = { code: "ECONNRESET" };
      throw error;
    });
    const after = await reread(user.id);

    assert.notEqual(after.verificationToken, priorToken);
    assert.ok(tokenInLetter(calls[0], after.verificationToken));
    assert.equal(result.outcome, "failed");
    assert.equal(result.priorLinkAlive, false);
    assert.match(result.serverLog, /ECONNRESET/);
    assert.doesNotMatch(result.serverLog, /fetch failed/);
  });

  // ── the first letter, at registration

  test("8 · a first letter proven not sent → both columns are null again", async () => {
    const user = await seedUser({ token: null });

    const { result } = await issue(user, () => jsonResponse(400, {}));
    const after = await reread(user.id);

    assert.equal(result.outcome, "failed");
    assert.equal(result.priorLinkAlive, false, "there was no previous link to keep");
    assert.deepEqual(after, { verificationToken: null, verificationTokenExpiry: null });
  });

  // ── the rollback is conditional

  test("9 · another request writes the column between our write and our rollback → its token survives", async () => {
    const priorToken = fresh("prior");
    const theirToken = fresh("theirs");
    const theirExpiry = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
    const user = await seedUser({ token: priorToken });

    // The replaced fetch runs exactly between the unconditional write of our
    // token and the conditional rollback — the real order of operations. A
    // resend from another tab lands there, and then our send is refused.
    const { result } = await issue(user, async () => {
      await prisma.user.update({
        where: { id: user.id },
        data: { verificationToken: theirToken, verificationTokenExpiry: theirExpiry },
      });
      return jsonResponse(400, {});
    });
    const after = await reread(user.id);

    assert.equal(after.verificationToken, theirToken, "their token was not rolled over");
    assert.equal(after.verificationTokenExpiry.getTime(), theirExpiry.getTime());
    assert.equal(result.outcome, "failed");
    assert.equal(result.priorLinkAlive, false, "OUR rollback did not land");
    // The columns above cannot tell «the rollback stepped aside» from «no
    // rollback ran»: their write lands after ours either way, and an update
    // that matches no row changes nothing. Only this line tells the two apart.
    assert.match(result.serverLog, /rollback skipped/);
  });
});
