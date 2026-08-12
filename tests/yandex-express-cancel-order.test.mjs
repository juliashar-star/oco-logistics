import assert from "node:assert/strict";
import test from "node:test";

import { cancelExpressOrder } from "../packages/core/src/carrier-adapter/yandex/express-client.ts";
import {
  OCO_CANCEL_REQUESTED,
  OCO_CANCEL_REQUESTED_TEXT_RU,
} from "../packages/core/src/carrier-adapter/cancel-event-codes.ts";
import { YandexAuthError } from "../packages/core/src/carrier-adapter/yandex/transport.ts";
import { resolveCancelTrackingEvent } from "../apps/web/lib/shipments/cancel-tracking-event.ts";

const CLAIM_ID = "claim-abc-123";
const CREDS = { platformStationId: "station-1", token: "t" };

const BASE = "https://b2b.taxi.tst.yandex.net";
const CLAIMS = "/b2b/cargo/integration/v2/claims";

const pathOf = (url) => new URL(url).pathname;
const isInfo = (url) => pathOf(url) === `${CLAIMS}/info`;
const isCancelInfo = (url) => pathOf(url) === `${CLAIMS}/cancel-info`;
const isCancel = (url) => pathOf(url) === `${CLAIMS}/cancel`;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Records every fetch so the tests can assert on WHICH endpoints were called
 * and in what order — the return value alone cannot prove that cancel was
 * skipped.
 */
function withStubbedFetch(handler, run) {
  return async () => {
    const realFetch = globalThis.fetch;
    const realBase = process.env.YANDEX_EXPRESS_BASE_URL;
    process.env.YANDEX_EXPRESS_BASE_URL = BASE;
    /** @type {{url: string, body: unknown}[]} */
    const calls = [];
    globalThis.fetch = async (url, init) => {
      const parsedBody =
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ url: String(url), body: parsedBody });
      return handler(String(url), parsedBody, calls);
    };
    try {
      await run(calls);
    } finally {
      globalThis.fetch = realFetch;
      if (realBase === undefined) delete process.env.YANDEX_EXPRESS_BASE_URL;
      else process.env.YANDEX_EXPRESS_BASE_URL = realBase;
    }
  };
}

const infoBody = (status, version = 7) => ({ status, version });

/** Every case that reaches cancel must send exactly this and nothing else. */
function assertCancelBodyIsFree(calls) {
  const cancelCall = calls.find((c) => isCancel(c.url));
  assert.ok(cancelCall, "cancel must have been called");
  assert.equal(cancelCall.body.cancel_state, "free");
  assert.equal(cancelCall.body.version, 7);
  assert.deepEqual(Object.keys(cancelCall.body).sort(), [
    "cancel_state",
    "version",
  ]);
}

function assertCancelNotCalled(calls) {
  assert.equal(
    calls.filter((c) => isCancel(c.url)).length,
    0,
    `cancel must NOT have been called; urls were ${calls.map((c) => pathOf(c.url)).join(", ")}`,
  );
}

// ── free → cancels ─────────────────────────────────────────────────────────

test(
  "free → cancel is called and ok:true with the post-cancel status",
  withStubbedFetch(
    (url, _body, calls) => {
      if (isInfo(url)) {
        // First info = pre-cancel (version); second = post-cancel (result).
        const infoCallCount = calls.filter((c) => isInfo(c.url)).length;
        return json(200, infoBody(infoCallCount === 1 ? "accepted" : "cancelled"));
      }
      if (isCancelInfo(url)) return json(200, { cancel_state: "free" });
      if (isCancel(url)) return json(200, {});
      throw new Error(`unexpected url ${url}`);
    },
    async (calls) => {
      const result = await cancelExpressOrder(CLAIM_ID, CREDS);
      assert.equal(result.ok, true);
      assert.equal(result.result.accepted, true);
      assert.equal(result.result.providerStatus, "cancelled");
      assertCancelBodyIsFree(calls);

      // The happy path is exactly four calls, in this order.
      assert.deepEqual(
        calls.map((c) => pathOf(c.url)),
        [
          `${CLAIMS}/info`,
          `${CLAIMS}/cancel-info`,
          `${CLAIMS}/cancel`,
          `${CLAIMS}/info`,
        ],
      );
      // claim_id travels in the query on every one of them.
      for (const call of calls) {
        assert.equal(new URL(call.url).searchParams.get("claim_id"), CLAIM_ID);
      }
    },
  ),
);

test(
  "description is the Russian label, not the raw code",
  withStubbedFetch(
    (url, _body, calls) => {
      if (isInfo(url)) {
        const n = calls.filter((c) => isInfo(c.url)).length;
        return json(200, infoBody(n === 1 ? "accepted" : "cancelled"));
      }
      if (isCancelInfo(url)) return json(200, { cancel_state: "free" });
      if (isCancel(url)) return json(200, {});
      throw new Error(`unexpected url ${url}`);
    },
    async () => {
      const result = await cancelExpressOrder(CLAIM_ID, CREDS);
      assert.equal(result.ok, true);
      assert.equal(result.result.description, "Отменено");
      assert.notEqual(result.result.description, "cancelled");

      // THE NORMAL BRANCH CARRIES NO REASON, pinned so the asymmetry with the
      // fallback stays deliberate. `reason` wins the statusCode slot in the
      // route, so setting one here would bury the carrier's own resulting
      // status — which, unlike CDEK's ACCEPTED, collides with nothing.
      assert.equal(result.result.reason, undefined);
      const event = resolveCancelTrackingEvent(result.result);
      assert.equal(event.statusCode, "cancelled");
      assert.equal(event.statusText, "Отменено");
    },
  ),
);

// ── refusals: cancel must never be reached ─────────────────────────────────

for (const [label, cancelInfoBody, expectedReason] of [
  ["paid", { cancel_state: "paid" }, "cancel_not_free"],
  ["unavailable", { cancel_state: "unavailable" }, "cancel_unavailable"],
  ["unparseable body", { nothing: "useful" }, "cancel_not_free"],
]) {
  test(
    `${label} → ${expectedReason}, and cancel is NOT called`,
    withStubbedFetch(
      (url) => {
        if (isInfo(url)) return json(200, infoBody("accepted"));
        if (isCancelInfo(url)) return json(200, cancelInfoBody);
        if (isCancel(url)) return json(200, {});
        throw new Error(`unexpected url ${url}`);
      },
      async (calls) => {
        const result = await cancelExpressOrder(CLAIM_ID, CREDS);
        assert.equal(result.ok, false);
        assert.equal(result.reason, expectedReason);
        assertCancelNotCalled(calls);
      },
    ),
  );
}

// ── version ────────────────────────────────────────────────────────────────

test(
  "missing version → throws, and cancel-info is never called",
  withStubbedFetch(
    (url) => {
      if (isInfo(url)) return json(200, { status: "accepted" }); // no version
      throw new Error(`unexpected url ${url}`);
    },
    async (calls) => {
      await assert.rejects(
        () => cancelExpressOrder(CLAIM_ID, CREDS),
        (err) =>
          err instanceof Error && /version unreadable/.test(err.message),
      );
      assert.equal(calls.filter((c) => isCancelInfo(c.url)).length, 0);
      assertCancelNotCalled(calls);
    },
  ),
);

// ── documented 409s ────────────────────────────────────────────────────────

for (const [code, expectedReason] of [
  ["free_cancel_is_unavailable", "cancel_not_free"],
  ["state_mismatch", "cancel_not_free"],
  ["inappropriate_status", "cancel_unavailable"],
]) {
  test(
    `409 ${code} → ${expectedReason}`,
    withStubbedFetch(
      (url) => {
        if (isInfo(url)) return json(200, infoBody("accepted"));
        if (isCancelInfo(url)) return json(200, { cancel_state: "free" });
        if (isCancel(url)) return json(409, { code });
        throw new Error(`unexpected url ${url}`);
      },
      async (calls) => {
        const result = await cancelExpressOrder(CLAIM_ID, CREDS);
        assert.equal(result.ok, false);
        assert.equal(result.reason, expectedReason);
        // It DID reach cancel, and sent "free" — the refusal came from Yandex.
        assertCancelBodyIsFree(calls);
      },
    ),
  );
}

test(
  "409 with an undocumented code throws rather than being guessed at",
  withStubbedFetch(
    (url) => {
      if (isInfo(url)) return json(200, infoBody("accepted"));
      if (isCancelInfo(url)) return json(200, { cancel_state: "free" });
      if (isCancel(url)) return json(409, { code: "something_new" });
      throw new Error(`unexpected url ${url}`);
    },
    async () => {
      await assert.rejects(
        () => cancelExpressOrder(CLAIM_ID, CREDS),
        (err) => err instanceof Error && /HTTP 409/.test(err.message),
      );
    },
  ),
);

// ── the post-cancel read is best-effort ────────────────────────────────────

test(
  "post-cancel info throws → still ok:true, providerStatus '', cancel NOT retried",
  withStubbedFetch(
    (url, _body, calls) => {
      if (isInfo(url)) {
        const n = calls.filter((c) => isInfo(c.url)).length;
        if (n === 1) return json(200, infoBody("accepted"));
        return json(500, { error: "boom" }); // post-cancel read fails
      }
      if (isCancelInfo(url)) return json(200, { cancel_state: "free" });
      if (isCancel(url)) return json(200, {});
      throw new Error(`unexpected url ${url}`);
    },
    async (calls) => {
      const result = await cancelExpressOrder(CLAIM_ID, CREDS);
      assert.equal(result.ok, true);
      assert.equal(result.result.accepted, true);
      assert.equal(result.result.providerStatus, "");
      // Exactly one cancel — the failed read must not trigger a retry.
      assert.equal(calls.filter((c) => isCancel(c.url)).length, 1);

      // THE CANCELLATION HAPPENED, so the timeline must show it. Without a
      // reason the route composes an empty statusCode and
      // resolveCancelTrackingEvent drops the row entirely — the claim would be
      // cancelled with nothing recorded against the shipment.
      assert.equal(result.result.reason, OCO_CANCEL_REQUESTED);
      assert.equal(result.result.description, OCO_CANCEL_REQUESTED_TEXT_RU);

      const event = resolveCancelTrackingEvent(result.result);
      assert.notEqual(event, null);
      assert.equal(event.statusCode, OCO_CANCEL_REQUESTED);
      assert.equal(event.statusText, OCO_CANCEL_REQUESTED_TEXT_RU);
    },
  ),
);

test(
  "post-cancel info returns no usable status → ok:true with providerStatus ''",
  withStubbedFetch(
    (url, _body, calls) => {
      if (isInfo(url)) {
        const n = calls.filter((c) => isInfo(c.url)).length;
        if (n === 1) return json(200, infoBody("accepted"));
        return json(200, { version: 8 }); // 200 but no status → fetchClaimsInfo throws
      }
      if (isCancelInfo(url)) return json(200, { cancel_state: "free" });
      if (isCancel(url)) return json(200, {});
      throw new Error(`unexpected url ${url}`);
    },
    async () => {
      const result = await cancelExpressOrder(CLAIM_ID, CREDS);
      assert.equal(result.ok, true);
      assert.equal(result.result.providerStatus, "");
    },
  ),
);

// ── auth ───────────────────────────────────────────────────────────────────

test(
  "401 propagates as YandexAuthError",
  withStubbedFetch(
    () => json(401, { code: "unauthorized" }),
    async () => {
      await assert.rejects(
        () => cancelExpressOrder(CLAIM_ID, CREDS),
        (err) => err instanceof YandexAuthError,
      );
    },
  ),
);

test(
  "cancel-info non-200 throws and cancel is not called",
  withStubbedFetch(
    (url) => {
      if (isInfo(url)) return json(200, infoBody("accepted"));
      if (isCancelInfo(url)) return json(500, { error: "boom" });
      if (isCancel(url)) return json(200, {});
      throw new Error(`unexpected url ${url}`);
    },
    async (calls) => {
      await assert.rejects(
        () => cancelExpressOrder(CLAIM_ID, CREDS),
        (err) => err instanceof Error && /cancel-info failed/.test(err.message),
      );
      assertCancelNotCalled(calls);
    },
  ),
);
