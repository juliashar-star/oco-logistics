import assert from "node:assert/strict";
import test from "node:test";

import {
  CdekAuthError,
  cdekGet,
  cdekPost,
} from "../packages/core/src/carrier-adapter/cdek/transport.ts";

/**
 * PINS WHAT cdekPost / cdekGet DO TODAY, before they are factored onto a shared
 * method-taking core.
 *
 * cdek-transport.test.mjs already covers the token call, caching and the
 * extraHeaders override. These are the gaps a method-parameterised refactor
 * could silently widen and nothing would catch: the verb each helper sends, the
 * request body (JSON on POST, ABSENT on GET), the Content-Type (present on
 * POST, absent on GET), the URL composition, and the 401/403 mapping on the
 * REQUEST call — the existing 401 test exercises the oauth call, not these.
 */

const CREDS = {
  account: "acct-verbs",
  securePassword: "pw-verbs",
  contractType: "1",
};
const BASE = "https://cdek-verbs.test";

/** Stubs the oauth call and one request call; returns the request's init. */
async function captureRequest(run) {
  const originalFetch = globalThis.fetch;
  /** @type {{url: string, init: RequestInit}[]} */
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) {
      return Response.json(
        { access_token: "tok-verbs", expires_in: 3600 },
        { status: 200 },
      );
    }
    calls.push({ url: href, init: init ?? {} });
    return Response.json({ ok: true }, { status: 200 });
  };
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls.length, 1, "exactly one non-token request expected");
  return calls[0];
}

test("cdekPost sends POST, a JSON body, and application/json", async () => {
  const { url, init } = await captureRequest(() =>
    cdekPost(BASE, CREDS, "/v2/orders", { a: 1, b: "два" }),
  );
  assert.equal(url, `${BASE}/v2/orders`);
  assert.equal(init.method, "POST");
  assert.equal(String(init.body), JSON.stringify({ a: 1, b: "два" }));
  const headers = new Headers(init.headers);
  assert.equal(headers.get("Content-Type"), "application/json");
  assert.equal(headers.get("Authorization"), "Bearer tok-verbs");
});

test("cdekGet sends GET, NO body and NO Content-Type", async () => {
  const { url, init } = await captureRequest(() =>
    cdekGet(BASE, CREDS, "/v2/orders?im_number=abc"),
  );
  assert.equal(url, `${BASE}/v2/orders?im_number=abc`);
  assert.equal(init.method, "GET");
  assert.equal(init.body ?? null, null);
  const headers = new Headers(init.headers);
  assert.equal(headers.get("Content-Type"), null);
  assert.equal(headers.get("Authorization"), "Bearer tok-verbs");
});

test("cdekPost serialises undefined body as undefined, not the string 'undefined'", async () => {
  const { init } = await captureRequest(() =>
    cdekPost(BASE, CREDS, "/v2/orders", undefined),
  );
  // JSON.stringify(undefined) === undefined — pinned because a shared core
  // could easily start sending "undefined" as a literal four-byte body.
  assert.equal(init.body ?? null, null);
});

test("extraHeaders are merged on cdekGet too, without displacing Authorization", async () => {
  const { init } = await captureRequest(() =>
    cdekGet(BASE, CREDS, "/v2/location/cities", {
      "X-Trace": "t-1",
      Authorization: "Bearer nope",
    }),
  );
  const headers = new Headers(init.headers);
  assert.equal(headers.get("X-Trace"), "t-1");
  assert.equal(headers.get("Authorization"), "Bearer tok-verbs");
});

/** 401/403 on the REQUEST call — distinct from the token call already covered. */
for (const status of [401, 403]) {
  test(`cdekPost HTTP ${status} → CdekAuthError, no body in the message`, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) =>
      String(url).endsWith("/v2/oauth/token")
        ? Response.json({ access_token: "t", expires_in: 3600 }, { status: 200 })
        : Response.json({ secret: "leak-me" }, { status });
    try {
      await assert.rejects(
        () => cdekPost(BASE, CREDS, "/v2/orders", {}),
        (error) => {
          assert.ok(error instanceof CdekAuthError);
          assert.equal(error.message, `CDEK auth failed: HTTP ${status}`);
          assert.doesNotMatch(error.message, /leak-me/);
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test(`cdekGet HTTP ${status} → CdekAuthError, no body in the message`, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) =>
      String(url).endsWith("/v2/oauth/token")
        ? Response.json({ access_token: "t", expires_in: 3600 }, { status: 200 })
        : Response.json({ secret: "leak-me" }, { status });
    try {
      await assert.rejects(
        () => cdekGet(BASE, CREDS, "/v2/orders/x"),
        (error) => {
          assert.ok(error instanceof CdekAuthError);
          assert.equal(error.message, `CDEK auth failed: HTTP ${status}`);
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}

test("cdekGet non-2xx that is not 401/403 returns the raw Response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) =>
    String(url).endsWith("/v2/oauth/token")
      ? Response.json({ access_token: "t", expires_in: 3600 }, { status: 200 })
      : Response.json({ errors: [{ code: "v2_entity_not_found" }] }, { status: 400 });
  try {
    const response = await cdekGet(BASE, CREDS, "/v2/orders/missing");
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.errors[0].code, "v2_entity_not_found");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
