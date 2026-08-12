import assert from "node:assert/strict";
import test from "node:test";

import { cancelCdekOrder } from "../packages/core/src/carrier-adapter/cdek/client.ts";
import {
  OCO_CANCEL_REQUESTED,
  OCO_CANCEL_REQUESTED_TEXT_RU,
} from "../packages/core/src/carrier-adapter/cancel-event-codes.ts";
import { mapCdekStatusToShipmentStatus } from "../packages/core/src/carrier-adapter/cdek/map-status.ts";
import { CdekAuthError } from "../packages/core/src/carrier-adapter/cdek/transport.ts";
import { resolveCancelTrackingEvent } from "../apps/web/lib/shipments/cancel-tracking-event.ts";

const CANCEL_DESCRIPTION_RU = OCO_CANCEL_REQUESTED_TEXT_RU;

const BASE = "https://api.edu.cdek.test";
const CREDS = { account: "acct", securePassword: "pw", contractType: "1" };

/** A uuid with characters that MUST be percent-encoded if any ever appear. */
const UUID = "a98b813e-01d4-4af5-8dde-8f0f5077620d";

const T0 = "2026-08-01T10:00:00+0300";
const T1 = "2026-08-02T10:00:00+0300";

const statusesBody = (codes) => ({
  entity: {
    uuid: UUID,
    statuses: codes.map(([code, date_time]) => ({ code, date_time, name: code })),
  },
});

const NOT_FOUND_BODY = {
  requests: [{ type: "GET", state: "INVALID", errors: [{ code: "v2_entity_not_found" }] }],
};

/**
 * Stubs oauth plus the order calls, recording url AND method for every
 * non-token request — the point of several assertions below is that DELETE was
 * never issued, which the return value alone cannot show.
 */
function withCdek(handler, run) {
  return async () => {
    const realFetch = globalThis.fetch;
    const realBase = process.env.CDEK_BASE_URL;
    process.env.CDEK_BASE_URL = BASE;
    /** @type {{method: string, url: string, path: string}[]} */
    const calls = [];
    globalThis.fetch = async (url, init) => {
      const href = String(url);
      if (href.endsWith("/v2/oauth/token")) {
        return Response.json({ access_token: "tok", expires_in: 3600 }, { status: 200 });
      }
      const method = init?.method ?? "GET";
      calls.push({ method, url: href, path: new URL(href).pathname });
      return handler(method, href, calls);
    };
    try {
      await run(calls);
    } finally {
      globalThis.fetch = realFetch;
      if (realBase === undefined) delete process.env.CDEK_BASE_URL;
      else process.env.CDEK_BASE_URL = realBase;
    }
  };
}

const deletes = (calls) => calls.filter((c) => c.method === "DELETE");

function assertNoDelete(calls) {
  assert.equal(
    deletes(calls).length,
    0,
    `no DELETE expected; calls were ${calls.map((c) => `${c.method} ${c.path}`).join(", ")}`,
  );
}

// ── deletable → DELETE issued once ─────────────────────────────────────────

test(
  "deletable → one DELETE on the right path, ok:true with the DELETE state",
  withCdek(
    (method) => {
      if (method === "GET") return Response.json(statusesBody([["CREATED", T0]]), { status: 200 });
      return Response.json(
        { entity: { uuid: UUID }, requests: [{ type: "DELETE", state: "ACCEPTED" }] },
        { status: 202 },
      );
    },
    async (calls) => {
      const result = await cancelCdekOrder(UUID, CREDS);
      assert.equal(result.ok, true);
      assert.equal(result.result.accepted, true);
      assert.equal(result.result.providerStatus, "ACCEPTED");

      assert.equal(deletes(calls).length, 1);
      assert.deepEqual(
        calls.map((c) => `${c.method} ${c.path}`),
        [`GET /v2/orders/${UUID}`, `DELETE /v2/orders/${UUID}`],
      );
    },
  ),
);

test(
  "the uuid is URL-encoded in the DELETE path",
  withCdek(
    (method) => {
      if (method === "GET") return Response.json(statusesBody([["CREATED", T0]]), { status: 200 });
      return Response.json({ requests: [{ type: "DELETE", state: "ACCEPTED" }] }, { status: 202 });
    },
    async (calls) => {
      const weird = "a/b c?d&e";
      await cancelCdekOrder(weird, CREDS);
      const del = deletes(calls)[0];
      assert.ok(del.url.includes(encodeURIComponent(weird)));
      assert.ok(!del.url.includes("a/b c?d&e"));
    },
  ),
);

test(
  "no DELETE state in the envelope → providerStatus is '' but the reason survives",
  withCdek(
    (method) => {
      if (method === "GET") return Response.json(statusesBody([["ACCEPTED", T0]]), { status: 200 });
      return Response.json({ requests: [{ type: "GET", state: "SUCCESSFUL" }] }, { status: 202 });
    },
    async () => {
      const result = await cancelCdekOrder(UUID, CREDS);
      assert.equal(result.ok, true);
      assert.equal(result.result.providerStatus, "");
      assert.equal(result.result.reason, OCO_CANCEL_REQUESTED);

      // THE BLANK-EVENT GUARD MUST NOT FIRE for a cancellation we actually
      // performed. resolveCancelTrackingEvent returns null only when there is
      // no code at all; the namespaced reason is exactly what keeps a real row
      // in the timeline when the envelope told us nothing.
      const event = resolveCancelTrackingEvent(result.result);
      assert.notEqual(event, null);
      assert.equal(event.statusCode, OCO_CANCEL_REQUESTED);
      assert.equal(event.statusText, CANCEL_DESCRIPTION_RU);
    },
  ),
);

// ── the vocabulary collision this slice removes ────────────────────────────

test(
  "success carries the namespaced reason and the Russian description",
  withCdek(
    (method) => {
      if (method === "GET") return Response.json(statusesBody([["CREATED", T0]]), { status: 200 });
      return Response.json(
        { requests: [{ type: "DELETE", state: "ACCEPTED" }] },
        { status: 202 },
      );
    },
    async () => {
      const result = await cancelCdekOrder(UUID, CREDS);
      assert.equal(result.result.reason, "OCO_CANCEL_REQUESTED");
      assert.equal(result.result.description, CANCEL_DESCRIPTION_RU);
      // The measured envelope state is KEPT, not replaced by our own word.
      assert.equal(result.result.providerStatus, "ACCEPTED");
    },
  ),
);

test(
  "the event written for a success is OUR code, never the bare envelope ACCEPTED",
  withCdek(
    (method) => {
      if (method === "GET") return Response.json(statusesBody([["CREATED", T0]]), { status: 200 });
      return Response.json(
        { requests: [{ type: "DELETE", state: "ACCEPTED" }] },
        { status: 202 },
      );
    },
    async () => {
      const result = await cancelCdekOrder(UUID, CREDS);
      const event = resolveCancelTrackingEvent(result.result);
      // This is the defect: "ACCEPTED" is also CDEK order status 0 «Принят»,
      // so a bare providerStatus here read as an order status that never
      // happened.
      assert.notEqual(event.statusCode, "ACCEPTED");
      assert.equal(event.statusCode, OCO_CANCEL_REQUESTED);
      assert.equal(event.statusText, CANCEL_DESCRIPTION_RU);
    },
  ),
);

test("the seller-facing cancellation wording and code, character for character", () => {
  // THE ONE PLACE THE LITERALS ARE WRITTEN OUT. Everywhere else — here and in
  // the Express file — the tests import the constants and compare against them,
  // which pins that producers agree but pins NOTHING about the wording itself:
  // changing the sentence, or emptying it, would leave all of those green.
  // This test is what makes the seller-facing text impossible to change
  // silently. Keep it as the only copy: repeating the literal in other tests
  // would give the next editor several places to update and one to forget.
  assert.equal(OCO_CANCEL_REQUESTED, "OCO_CANCEL_REQUESTED");
  assert.equal(
    OCO_CANCEL_REQUESTED_TEXT_RU,
    "Запрос на отмену отправлен перевозчику. Подтверждение придёт со следующим обновлением статуса.",
  );
});

test("OCO_CANCEL_REQUESTED is outside «Приложение 1», so it never moves Shipment.status", () => {
  // The namespacing is only worth anything if the status mapper does not know
  // it — otherwise writing the event would change the shipment's status.
  assert.equal(mapCdekStatusToShipmentStatus(OCO_CANCEL_REQUESTED), null);
  // ...while the colliding word still maps, which is why it had to be avoided.
  assert.equal(mapCdekStatusToShipmentStatus("ACCEPTED"), "CREATED");
});

// ── refusals: DELETE must never be issued ──────────────────────────────────

test(
  "not_free → cancel_not_free and NO DELETE",
  withCdek(
    () => Response.json(statusesBody([["CREATED", T0], ["RECEIVED_AT_SHIPMENT_WAREHOUSE", T1]]), { status: 200 }),
    async (calls) => {
      const result = await cancelCdekOrder(UUID, CREDS);
      assert.equal(result.ok, false);
      assert.equal(result.reason, "cancel_not_free");
      assertNoDelete(calls);
    },
  ),
);

test(
  "unavailable → cancel_unavailable and NO DELETE",
  withCdek(
    () => Response.json(statusesBody([["DELIVERED", T1]]), { status: 200 }),
    async (calls) => {
      const result = await cancelCdekOrder(UUID, CREDS);
      assert.equal(result.ok, false);
      assert.equal(result.reason, "cancel_unavailable");
      assertNoDelete(calls);
    },
  ),
);

test(
  "already REMOVED → cancel_unavailable and NO DELETE",
  withCdek(
    () => Response.json(statusesBody([["REMOVED", T1]]), { status: 200 }),
    async (calls) => {
      const result = await cancelCdekOrder(UUID, CREDS);
      assert.equal(result.reason, "cancel_unavailable");
      assertNoDelete(calls);
    },
  ),
);

test(
  "unknown window → THROWS and NO DELETE",
  withCdek(
    () => Response.json({ entity: { uuid: UUID, statuses: [] } }, { status: 200 }),
    async (calls) => {
      await assert.rejects(
        () => cancelCdekOrder(UUID, CREDS),
        (error) => error instanceof Error && /cancel window unreadable/.test(error.message),
      );
      assertNoDelete(calls);
    },
  ),
);

test(
  "unreadable newest over CREATED → unknown → throws, NO DELETE (the one-sided guard reaches here)",
  withCdek(
    () =>
      Response.json(
        {
          entity: {
            uuid: UUID,
            statuses: [
              { code: "RECEIVED_AT_SHIPMENT_WAREHOUSE", date_time: "not-a-date" },
              { code: "CREATED", date_time: T0, name: "CREATED" },
            ],
          },
        },
        { status: 200 },
      ),
    async (calls) => {
      await assert.rejects(() => cancelCdekOrder(UUID, CREDS));
      assertNoDelete(calls);
    },
  ),
);

// ── not found, either side ─────────────────────────────────────────────────

test(
  "the READ returns the uuid-miss code → order_not_found, NO DELETE",
  withCdek(
    () => Response.json(NOT_FOUND_BODY, { status: 400 }),
    async (calls) => {
      const result = await cancelCdekOrder(UUID, CREDS);
      assert.equal(result.ok, false);
      assert.equal(result.reason, "order_not_found");
      assertNoDelete(calls);
    },
  ),
);

test(
  "the DELETE returns the uuid-miss code → order_not_found",
  withCdek(
    (method) => {
      if (method === "GET") return Response.json(statusesBody([["CREATED", T0]]), { status: 200 });
      return Response.json(NOT_FOUND_BODY, { status: 400 });
    },
    async (calls) => {
      const result = await cancelCdekOrder(UUID, CREDS);
      assert.equal(result.ok, false);
      assert.equal(result.reason, "order_not_found");
      assert.equal(deletes(calls).length, 1);
    },
  ),
);

test(
  "a 400 with the NUMBER-lookup code is NOT treated as a uuid miss",
  withCdek(
    (method) => {
      if (method === "GET") return Response.json(statusesBody([["CREATED", T0]]), { status: 200 });
      return Response.json(
        { requests: [{ errors: [{ code: "v2_entity_not_found_im_number" }] }] },
        { status: 400 },
      );
    },
    async () => {
      // Exact match, never a prefix — this must fault, not report not-found.
      await assert.rejects(
        () => cancelCdekOrder(UUID, CREDS),
        (error) => error instanceof Error && /HTTP 400/.test(error.message),
      );
    },
  ),
);

// ── failures ───────────────────────────────────────────────────────────────

test(
  "DELETE 500 → throws with the status only: no body, no uuid",
  withCdek(
    (method) => {
      if (method === "GET") return Response.json(statusesBody([["CREATED", T0]]), { status: 200 });
      return Response.json({ secret: "leak-me", uuid: UUID }, { status: 500 });
    },
    async () => {
      await assert.rejects(
        () => cancelCdekOrder(UUID, CREDS),
        (error) => {
          assert.ok(error instanceof Error);
          assert.equal(error.message, "CDEK cancel order failed: HTTP 500");
          assert.doesNotMatch(error.message, /leak-me/);
          assert.doesNotMatch(error.message, new RegExp(UUID));
          return true;
        },
      );
    },
  ),
);

test(
  "auth error on the DELETE propagates as CdekAuthError",
  withCdek(
    (method) => {
      if (method === "GET") return Response.json(statusesBody([["CREATED", T0]]), { status: 200 });
      return Response.json({}, { status: 401 });
    },
    async () => {
      await assert.rejects(
        () => cancelCdekOrder(UUID, CREDS),
        (error) => error instanceof CdekAuthError,
      );
    },
  ),
);

test(
  "auth error on the READ propagates and NO DELETE is attempted",
  withCdek(
    () => Response.json({}, { status: 403 }),
    async (calls) => {
      await assert.rejects(
        () => cancelCdekOrder(UUID, CREDS),
        (error) => error instanceof CdekAuthError,
      );
      assertNoDelete(calls);
    },
  ),
);
