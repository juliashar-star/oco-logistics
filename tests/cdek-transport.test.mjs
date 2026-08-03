import assert from "node:assert/strict";
import test from "node:test";

import {
  CdekAuthError,
  assertCdekCredentials,
  cdekGet,
  cdekPost,
  fetchCdekToken,
  resolveBaseUrl,
} from "../packages/core/src/carrier-adapter/cdek/transport.ts";

const SECRET = "super-secret-password-xyz";

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

test("token request is form-encoded with grant_type/client_id/client_secret", async () => {
  const baseUrl = "https://cdek-form.test";
  const creds = { account: "acct-form", securePassword: SECRET, contractType: "1" };
  /** @type {{ method?: string, headers?: HeadersInit, body?: BodyInit | null }} */
  let seen = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), `${baseUrl}/v2/oauth/token`);
    seen = init ?? {};
    return Response.json(
      { access_token: "tok-form", expires_in: 3600 },
      { status: 200 },
    );
  };
  try {
    await fetchCdekToken(baseUrl, creds);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(seen.method, "POST");
  const headers = new Headers(seen.headers);
  assert.equal(
    headers.get("Content-Type"),
    "application/x-www-form-urlencoded",
  );
  const params = new URLSearchParams(String(seen.body));
  assert.equal(params.get("grant_type"), "client_credentials");
  assert.equal(params.get("client_id"), "acct-form");
  assert.equal(params.get("client_secret"), SECRET);
});

test("401 on token call → CdekAuthError; message has neither secret nor body", async () => {
  const baseUrl = "https://cdek-401.test";
  const creds = { account: "acct-401", securePassword: SECRET, contractType: "1" };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "bad_client", hint: SECRET }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  try {
    await assert.rejects(
      () => fetchCdekToken(baseUrl, creds),
      (error) => {
        assert.ok(error instanceof CdekAuthError);
        assert.match(error.message, /CDEK auth failed: HTTP 401/);
        assert.equal(error.message.includes(SECRET), false);
        assert.equal(error.message.includes("bad_client"), false);
        assert.equal(error.message.includes("hint"), false);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cached token is reused across two cdekGet calls (one oauth fetch)", async () => {
  const baseUrl = "https://cdek-reuse.test";
  const creds = { account: "acct-reuse", securePassword: SECRET, contractType: "1" };
  let oauthCalls = 0;
  let getCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) {
      oauthCalls += 1;
      return Response.json(
        { access_token: "tok-reuse", expires_in: 3600 },
        { status: 200 },
      );
    }
    getCalls += 1;
    assert.equal(init?.method, "GET");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("Authorization"), "Bearer tok-reuse");
    return new Response("{}", { status: 200 });
  };
  try {
    await cdekGet(baseUrl, creds, "/v2/location/cities");
    await cdekGet(baseUrl, creds, "/v2/location/cities");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(oauthCalls, 1);
  assert.equal(getCalls, 2);
});

test("two different accounts never share a token", async () => {
  const baseUrl = "https://cdek-two-acct.test";
  const a = { account: "acct-A", securePassword: "secret-A", contractType: "1" };
  const b = { account: "acct-B", securePassword: "secret-B", contractType: "1" };
  /** @type {string[]} */
  const authHeaders = [];
  let oauthCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) {
      oauthCalls += 1;
      const params = new URLSearchParams(String(init?.body));
      const account = params.get("client_id");
      return Response.json(
        { access_token: `tok-${account}`, expires_in: 3600 },
        { status: 200 },
      );
    }
    authHeaders.push(new Headers(init?.headers).get("Authorization") ?? "");
    return new Response("{}", { status: 200 });
  };
  try {
    await cdekGet(baseUrl, a, "/v2/a");
    await cdekGet(baseUrl, b, "/v2/b");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(oauthCalls, 2);
  assert.deepEqual(authHeaders, ["Bearer tok-acct-A", "Bearer tok-acct-B"]);
});

test("expired cache entry refetches (driven by injected now)", async () => {
  const baseUrl = "https://cdek-expiry.test";
  const creds = { account: "acct-exp", securePassword: SECRET, contractType: "1" };
  let clock = 1_000_000;
  let oauthCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    oauthCalls += 1;
    return Response.json(
      { access_token: `tok-${oauthCalls}`, expires_in: 120 },
      { status: 200 },
    );
  };
  try {
    const first = await fetchCdekToken(baseUrl, creds, () => clock);
    assert.equal(first, "tok-1");
    assert.equal(oauthCalls, 1);

    // Still inside safety window: expiresAt = 1_000_000 + 120_000 = 1_120_000;
    // reuse while now < 1_120_000 - 60_000 = 1_060_000.
    clock = 1_059_999;
    const second = await fetchCdekToken(baseUrl, creds, () => clock);
    assert.equal(second, "tok-1");
    assert.equal(oauthCalls, 1);

    // Past margin → refetch.
    clock = 1_060_000;
    const third = await fetchCdekToken(baseUrl, creds, () => clock);
    assert.equal(third, "tok-2");
    assert.equal(oauthCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("extraHeaders cannot override Authorization or Content-Type on cdekPost", async () => {
  const baseUrl = "https://cdek-headers.test";
  const creds = { account: "acct-hdr", securePassword: SECRET, contractType: "1" };
  /** @type {HeadersInit | undefined} */
  let seenHeaders;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) {
      return Response.json(
        { access_token: "tok-hdr", expires_in: 3600 },
        { status: 200 },
      );
    }
    seenHeaders = init?.headers;
    return new Response("{}", { status: 200 });
  };
  try {
    await cdekPost(baseUrl, creds, "/v2/calculator", { a: 1 }, {
      "Accept-Language": "ru",
      Authorization: "Bearer attacker-override",
      "Content-Type": "text/plain",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(seenHeaders);
  const headers = new Headers(seenHeaders);
  assert.equal(headers.get("Accept-Language"), "ru");
  assert.equal(headers.get("Authorization"), "Bearer tok-hdr");
  assert.equal(headers.get("Content-Type"), "application/json");
});

test("cdekPost HTTP 500 returns raw Response, does not throw", async () => {
  const baseUrl = "https://cdek-500.test";
  const creds = { account: "acct-500", securePassword: SECRET, contractType: "1" };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/v2/oauth/token")) {
      return Response.json(
        { access_token: "tok-500", expires_in: 3600 },
        { status: 200 },
      );
    }
    return new Response("server boom", { status: 500 });
  };
  try {
    const response = await cdekPost(baseUrl, creds, "/v2/orders", {});
    assert.equal(response.status, 500);
    assert.equal(await response.text(), "server boom");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("expires_in as number 3600 → cached with that lifetime", async () => {
  const baseUrl = "https://cdek-exp-num.test";
  const creds = { account: "acct-exp-num", securePassword: SECRET, contractType: "1" };
  let clock = 10_000_000;
  let oauthCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    oauthCalls += 1;
    return Response.json(
      { access_token: `tok-num-${oauthCalls}`, expires_in: 3600 },
      { status: 200 },
    );
  };
  try {
    assert.equal(await fetchCdekToken(baseUrl, creds, () => clock), "tok-num-1");
    // reuse while now < 10_000_000 + 3_600_000 - 60_000 = 13_540_000
    clock = 13_539_999;
    assert.equal(await fetchCdekToken(baseUrl, creds, () => clock), "tok-num-1");
    assert.equal(oauthCalls, 1);
    clock = 13_540_000;
    assert.equal(await fetchCdekToken(baseUrl, creds, () => clock), "tok-num-2");
    assert.equal(oauthCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('expires_in as string "3600" → same lifetime behaviour', async () => {
  const baseUrl = "https://cdek-exp-str.test";
  const creds = { account: "acct-exp-str", securePassword: SECRET, contractType: "1" };
  let clock = 20_000_000;
  let oauthCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    oauthCalls += 1;
    return Response.json(
      { access_token: `tok-str-${oauthCalls}`, expires_in: "3600" },
      { status: 200 },
    );
  };
  try {
    assert.equal(await fetchCdekToken(baseUrl, creds, () => clock), "tok-str-1");
    clock = 23_539_999;
    assert.equal(await fetchCdekToken(baseUrl, creds, () => clock), "tok-str-1");
    assert.equal(oauthCalls, 1);
    clock = 23_540_000;
    assert.equal(await fetchCdekToken(baseUrl, creds, () => clock), "tok-str-2");
    assert.equal(oauthCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("expires_in absent → falls back to 3600 seconds", async () => {
  const baseUrl = "https://cdek-exp-absent.test";
  const creds = { account: "acct-exp-absent", securePassword: SECRET, contractType: "1" };
  let clock = 30_000_000;
  let oauthCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    oauthCalls += 1;
    return Response.json(
      { access_token: `tok-abs-${oauthCalls}` },
      { status: 200 },
    );
  };
  try {
    assert.equal(await fetchCdekToken(baseUrl, creds, () => clock), "tok-abs-1");
    // fallback 3600 s → same margin boundary as above
    clock = 33_539_999;
    assert.equal(await fetchCdekToken(baseUrl, creds, () => clock), "tok-abs-1");
    assert.equal(oauthCalls, 1);
    clock = 33_540_000;
    assert.equal(await fetchCdekToken(baseUrl, creds, () => clock), "tok-abs-2");
    assert.equal(oauthCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("missing access_token still throws", async () => {
  const baseUrl = "https://cdek-no-token.test";
  const creds = { account: "acct-no-token", securePassword: SECRET, contractType: "1" };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ expires_in: 3600 }, { status: 200 });
  try {
    await assert.rejects(
      () => fetchCdekToken(baseUrl, creds),
      (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /missing access_token/);
        assert.equal(error.message.includes(SECRET), false);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("concurrent cdekGet for same account → one oauth fetch, same Bearer", async () => {
  const baseUrl = "https://cdek-concurrent.test";
  const creds = { account: "acct-concurrent", securePassword: SECRET, contractType: "1" };
  let oauthCalls = 0;
  /** @type {string[]} */
  const authHeaders = [];
  let releaseToken;
  const tokenGate = new Promise((resolve) => {
    releaseToken = resolve;
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) {
      oauthCalls += 1;
      await tokenGate;
      return Response.json(
        { access_token: "tok-shared", expires_in: 3600 },
        { status: 200 },
      );
    }
    authHeaders.push(new Headers(init?.headers).get("Authorization") ?? "");
    return new Response("{}", { status: 200 });
  };
  try {
    const started = Promise.all([
      cdekGet(baseUrl, creds, "/v2/a"),
      cdekGet(baseUrl, creds, "/v2/b"),
    ]);
    releaseToken();
    await started;
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(oauthCalls, 1);
  assert.deepEqual(authHeaders, ["Bearer tok-shared", "Bearer tok-shared"]);
});

test("failed token request does not poison cache; next call retries", async () => {
  const baseUrl = "https://cdek-poison.test";
  const creds = { account: "acct-poison", securePassword: SECRET, contractType: "1" };
  let oauthCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    oauthCalls += 1;
    if (oauthCalls === 1) {
      return new Response("nope", { status: 500 });
    }
    return Response.json(
      { access_token: "tok-recovered", expires_in: 3600 },
      { status: 200 },
    );
  };
  try {
    await assert.rejects(() => fetchCdekToken(baseUrl, creds), (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /CDEK token request failed: HTTP 500/);
      return true;
    });
    assert.equal(await fetchCdekToken(baseUrl, creds), "tok-recovered");
    assert.equal(oauthCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("assertCdekCredentials throws when account absent; message has neither value", () => {
  const securePassword = "pw-must-not-leak";
  assert.throws(
    () => assertCdekCredentials({ securePassword, contractType: "1" }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(
        error.message,
        /CDEK_CREDENTIALS_INVALID: account, securePassword and contractType are required/,
      );
      assert.equal(error.message.includes(securePassword), false);
      return true;
    },
  );
});

test("assertCdekCredentials throws when securePassword absent; message has neither value", () => {
  const account = "acct-must-not-leak";
  assert.throws(
    () => assertCdekCredentials({ account, contractType: "1" }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(
        error.message,
        /CDEK_CREDENTIALS_INVALID: account, securePassword and contractType are required/,
      );
      assert.equal(error.message.includes(account), false);
      return true;
    },
  );
});

test("assertCdekCredentials throws when contractType absent; message has neither value", () => {
  const account = "acct-contract-leak";
  const securePassword = "pw-contract-leak";
  assert.throws(
    () => assertCdekCredentials({ account, securePassword }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(
        error.message,
        /CDEK_CREDENTIALS_INVALID: account, securePassword and contractType are required/,
      );
      assert.equal(error.message.includes(account), false);
      assert.equal(error.message.includes(securePassword), false);
      return true;
    },
  );
});

test("resolveBaseUrl strips trailing slash", async () => {
  await withEnv("CDEK_BASE_URL_TEST_STRIP", "https://api.edu.cdek.ru/", () => {
    assert.equal(
      resolveBaseUrl("CDEK_BASE_URL_TEST_STRIP"),
      "https://api.edu.cdek.ru",
    );
  });
});

test("resolveBaseUrl throws when env var is empty", async () => {
  await withEnv("CDEK_BASE_URL_TEST_EMPTY", "", () => {
    assert.throws(
      () => resolveBaseUrl("CDEK_BASE_URL_TEST_EMPTY"),
      /CDEK_BASE_URL_TEST_EMPTY is not configured/,
    );
  });
});
