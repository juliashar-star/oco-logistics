import assert from "node:assert/strict";
import test from "node:test";

import {
  VERIFY_CREDENTIALS_ADAPTERS,
  VERIFY_SERVER_ERROR_ATTEMPTS,
  getVerifyCredentialsAdapter,
  isKnownVerifyCredentialsProviderKey,
  verdictForOutcome,
} from "../packages/core/src/carrier-adapter/verify-credentials-adapters.ts";
import { fetchCdekToken } from "../packages/core/src/carrier-adapter/cdek/transport.ts";
import { PROTOTYPE_KEYS } from "./helpers/prototype-keys.mjs";

const YANDEX_BASE_URL = "https://b2b.taxi.tst.yandex.net";
const CDEK_BASE_URL = "https://api.edu.cdek.ru";

const YANDEX_CREDS = {
  platformStationId: "fbed3aa1-2cc6-4370-ab4d-59c5cc9bb924",
  token: "test-token",
};
const CDEK_CREDS = {
  account: "acct-verify",
  securePassword: "secret-must-not-leak",
  contractType: "1",
};

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

function installFetchMock(handler) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler({ url: String(url), init, calls });
  };
  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// A fresh CDEK account per test: fetchCdekToken caches by (baseUrl, account,
// secret), so reusing one account would serve a cached token and skip the fetch.
let cdekAccountCounter = 0;
function freshCdekCreds(extra = {}) {
  cdekAccountCounter += 1;
  return { ...CDEK_CREDS, account: `acct-verify-${cdekAccountCounter}`, ...extra };
}

// ── The PURE verdict mapping: every branch, no network.

test("verdictForOutcome: ok → accepted", () => {
  assert.deepEqual(verdictForOutcome({ kind: "ok" }), { status: "accepted" });
});

test("verdictForOutcome: auth_failed → rejected/invalid_auth", () => {
  assert.deepEqual(verdictForOutcome({ kind: "auth_failed" }), {
    status: "rejected",
    reason: "invalid_auth",
  });
});

test("verdictForOutcome: malformed_credentials → rejected/malformed_credentials", () => {
  assert.deepEqual(verdictForOutcome({ kind: "malformed_credentials" }), {
    status: "rejected",
    reason: "malformed_credentials",
  });
});

test("verdictForOutcome: server_error → unavailable", () => {
  assert.deepEqual(verdictForOutcome({ kind: "server_error" }), {
    status: "unavailable",
  });
});

test("verdictForOutcome: bad_request «validation_error» → rejected/invalid_source_station", () => {
  assert.deepEqual(
    verdictForOutcome({ kind: "bad_request", code: "validation_error" }),
    { status: "rejected", reason: "invalid_source_station" },
  );
});

test("verdictForOutcome: bad_request «pickups_not_configured» → ACCEPTED", () => {
  // Measured 09.08: valid stored credentials answered exactly this while the
  // same pair produced working Express offers.
  assert.deepEqual(
    verdictForOutcome({ kind: "bad_request", code: "pickups_not_configured" }),
    { status: "accepted" },
  );
});

test("verdictForOutcome: bad_request with an unknown or unreadable code → ACCEPTED", () => {
  // Failing closed on a code nobody enumerated would lock a valid seller out.
  for (const code of ["some_future_code", "", null]) {
    assert.deepEqual(
      verdictForOutcome({ kind: "bad_request", code }),
      { status: "accepted" },
      String(code),
    );
  }
});

test("verdictForOutcome: config_error → unavailable, never rejected", () => {
  // Our base URL being unset says nothing about the seller's credentials.
  assert.deepEqual(verdictForOutcome({ kind: "config_error" }), {
    status: "unavailable",
  });
});

test("verdictForOutcome: transport_error → unavailable", () => {
  assert.deepEqual(verdictForOutcome({ kind: "transport_error" }), {
    status: "unavailable",
  });
});

test("verdictForOutcome: the station reason differs from the auth reason", () => {
  const station = verdictForOutcome({
    kind: "bad_request",
    code: "validation_error",
  });
  const auth = verdictForOutcome({ kind: "auth_failed" });
  assert.equal(station.status, "rejected");
  assert.equal(auth.status, "rejected");
  assert.notEqual(station.reason, auth.reason);
});

// ── Registry shape / resolution (same rules as PICKUP_POINT_ADAPTERS).

test("registry: keyed by providerKey for both carriers", () => {
  assert.deepEqual(Object.keys(VERIFY_CREDENTIALS_ADAPTERS).sort(), [
    "cdek",
    "yataxi",
  ]);
  for (const [key, entry] of Object.entries(VERIFY_CREDENTIALS_ADAPTERS)) {
    assert.equal(entry.providerKey, key);
    assert.equal(typeof entry.verifyCredentials, "function");
  }
});

test("isKnownVerifyCredentialsProviderKey: refuses prototype-chain keys and non-strings", () => {
  assert.equal(isKnownVerifyCredentialsProviderKey("cdek"), true);
  assert.equal(isKnownVerifyCredentialsProviderKey("yataxi"), true);
  for (const bad of [...PROTOTYPE_KEYS, "", 1, null, undefined]) {
    assert.equal(isKnownVerifyCredentialsProviderKey(bad), false, String(bad));
  }
  assert.equal(getVerifyCredentialsAdapter("nope"), undefined);
});

// ── YANDEX through the global-fetch swap.

test("yandex verify: HTTP 200 with priced options → accepted", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", YANDEX_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(200, { pricing_total: "374.54 RUB", delivery_days: 2 }),
    );
    try {
      const verdict =
        await VERIFY_CREDENTIALS_ADAPTERS.yataxi.verifyCredentials(YANDEX_CREDS);
      assert.deepEqual(verdict, { status: "accepted" });
      assert.equal(mock.calls.length, 1);
      assert.match(mock.calls[0].url, /\/api\/b2b\/platform\/pricing-calculator$/);
    } finally {
      mock.restore();
    }
  });
});

test("yandex verify: HTTP 200 with NO options → still accepted (verdict not derived from options)", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", YANDEX_BASE_URL, async () => {
    const mock = installFetchMock(() => jsonResponse(200, {}));
    try {
      const verdict =
        await VERIFY_CREDENTIALS_ADAPTERS.yataxi.verifyCredentials(YANDEX_CREDS);
      assert.deepEqual(verdict, { status: "accepted" });
    } finally {
      mock.restore();
    }
  });
});

test("yandex verify: wrong station → HTTP 400 validation_error → rejected/invalid_source_station", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", YANDEX_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(400, { code: "validation_error" }),
    );
    try {
      const verdict =
        await VERIFY_CREDENTIALS_ADAPTERS.yataxi.verifyCredentials(YANDEX_CREDS);
      assert.deepEqual(verdict, {
        status: "rejected",
        reason: "invalid_source_station",
      });
      // A 400 is an answer, not a blip: exactly one attempt, no retry.
      assert.equal(mock.calls.length, 1);
    } finally {
      mock.restore();
    }
  });
});

test("yandex verify: bad token → 401 → rejected/invalid_auth, no retry", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", YANDEX_BASE_URL, async () => {
    const mock = installFetchMock(() => jsonResponse(401, { code: "unauthorized" }));
    try {
      const verdict =
        await VERIFY_CREDENTIALS_ADAPTERS.yataxi.verifyCredentials(YANDEX_CREDS);
      assert.deepEqual(verdict, { status: "rejected", reason: "invalid_auth" });
      assert.equal(mock.calls.length, 1);
    } finally {
      mock.restore();
    }
  });
});

test("yandex verify: persistent 5xx → unavailable after the fixed retries", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", YANDEX_BASE_URL, async () => {
    const mock = installFetchMock(() => jsonResponse(500, { code: "500" }));
    try {
      const verdict =
        await VERIFY_CREDENTIALS_ADAPTERS.yataxi.verifyCredentials(YANDEX_CREDS);
      assert.deepEqual(verdict, { status: "unavailable" });
      assert.equal(mock.calls.length, VERIFY_SERVER_ERROR_ATTEMPTS);
    } finally {
      mock.restore();
    }
  });
});

test("yandex verify: 5xx then 200 → accepted (retry succeeded)", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", YANDEX_BASE_URL, async () => {
    let n = 0;
    const mock = installFetchMock(() => {
      n += 1;
      return n === 1
        ? jsonResponse(500, { code: "500" })
        : jsonResponse(200, { pricing_total: "374.54 RUB", delivery_days: 2 });
    });
    try {
      const verdict =
        await VERIFY_CREDENTIALS_ADAPTERS.yataxi.verifyCredentials(YANDEX_CREDS);
      assert.deepEqual(verdict, { status: "accepted" });
      assert.equal(mock.calls.length, 2);
    } finally {
      mock.restore();
    }
  });
});

test("yandex verify: credentials missing a field → rejected/malformed_credentials, zero fetches", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", YANDEX_BASE_URL, async () => {
    const mock = installFetchMock(() => jsonResponse(200, {}));
    try {
      const verdict = await VERIFY_CREDENTIALS_ADAPTERS.yataxi.verifyCredentials({
        token: "test-token",
      });
      assert.deepEqual(verdict, {
        status: "rejected",
        reason: "malformed_credentials",
      });
      assert.equal(mock.calls.length, 0);
    } finally {
      mock.restore();
    }
  });
});

test("yandex verify: neither secret nor provider body appears in the verdict", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", YANDEX_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(400, { code: "validation_error", message: "station leak-me" }),
    );
    try {
      const verdict =
        await VERIFY_CREDENTIALS_ADAPTERS.yataxi.verifyCredentials(YANDEX_CREDS);
      const serialized = JSON.stringify(verdict);
      assert.ok(!serialized.includes(YANDEX_CREDS.token));
      assert.ok(!serialized.includes(YANDEX_CREDS.platformStationId));
      assert.ok(!serialized.includes("leak-me"));
    } finally {
      mock.restore();
    }
  });
});

// ── CDEK through the global-fetch swap (token fetch IS the check).

test("cdek verify: token 200 → accepted", async () => {
  await withEnv("CDEK_BASE_URL", CDEK_BASE_URL, async () => {
    const mock = installFetchMock(({ url }) => {
      assert.match(url, /\/v2\/oauth\/token$/);
      return jsonResponse(200, { access_token: "tok-ok", expires_in: 3600 });
    });
    try {
      const verdict =
        await VERIFY_CREDENTIALS_ADAPTERS.cdek.verifyCredentials(freshCdekCreds());
      assert.deepEqual(verdict, { status: "accepted" });
      assert.equal(mock.calls.length, 1);
    } finally {
      mock.restore();
    }
  });
});

test("cdek verify: token 401 → rejected/invalid_auth, no retry", async () => {
  await withEnv("CDEK_BASE_URL", CDEK_BASE_URL, async () => {
    const mock = installFetchMock(() => jsonResponse(401, { message: "nope" }));
    try {
      const verdict =
        await VERIFY_CREDENTIALS_ADAPTERS.cdek.verifyCredentials(freshCdekCreds());
      assert.deepEqual(verdict, { status: "rejected", reason: "invalid_auth" });
      assert.equal(mock.calls.length, 1);
    } finally {
      mock.restore();
    }
  });
});

test("cdek verify: persistent 5xx → unavailable after the fixed retries", async () => {
  await withEnv("CDEK_BASE_URL", CDEK_BASE_URL, async () => {
    const mock = installFetchMock(() => jsonResponse(500, { message: "boom" }));
    try {
      const verdict =
        await VERIFY_CREDENTIALS_ADAPTERS.cdek.verifyCredentials(freshCdekCreds());
      assert.deepEqual(verdict, { status: "unavailable" });
      assert.equal(mock.calls.length, VERIFY_SERVER_ERROR_ATTEMPTS);
    } finally {
      mock.restore();
    }
  });
});

test("cdek verify: 5xx then 200 → accepted (retry succeeded)", async () => {
  await withEnv("CDEK_BASE_URL", CDEK_BASE_URL, async () => {
    let n = 0;
    const mock = installFetchMock(() => {
      n += 1;
      return n === 1
        ? jsonResponse(503, { message: "later" })
        : jsonResponse(200, { access_token: "tok-retry", expires_in: 3600 });
    });
    try {
      const verdict =
        await VERIFY_CREDENTIALS_ADAPTERS.cdek.verifyCredentials(freshCdekCreds());
      assert.deepEqual(verdict, { status: "accepted" });
      assert.equal(mock.calls.length, 2);
    } finally {
      mock.restore();
    }
  });
});

test("cdek verify: credentials missing a field → rejected/malformed_credentials, zero fetches", async () => {
  await withEnv("CDEK_BASE_URL", CDEK_BASE_URL, async () => {
    const mock = installFetchMock(() => jsonResponse(200, {}));
    try {
      const verdict = await VERIFY_CREDENTIALS_ADAPTERS.cdek.verifyCredentials({
        account: "acct-only",
      });
      assert.deepEqual(verdict, {
        status: "rejected",
        reason: "malformed_credentials",
      });
      assert.equal(mock.calls.length, 0);
    } finally {
      mock.restore();
    }
  });
});

// ── Finding 1: an unset base URL is a verdict, not a throw.

test("yandex verify: YANDEX_DELIVERY_BASE_URL unset → unavailable, does not throw", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", undefined, async () => {
    const mock = installFetchMock(() => jsonResponse(200, {}));
    try {
      const verdict =
        await VERIFY_CREDENTIALS_ADAPTERS.yataxi.verifyCredentials(YANDEX_CREDS);
      assert.deepEqual(verdict, { status: "unavailable" });
      assert.equal(mock.calls.length, 0);
    } finally {
      mock.restore();
    }
  });
});

test("cdek verify: CDEK_BASE_URL unset → unavailable, does not throw", async () => {
  await withEnv("CDEK_BASE_URL", undefined, async () => {
    const mock = installFetchMock(() => jsonResponse(200, {}));
    try {
      const verdict =
        await VERIFY_CREDENTIALS_ADAPTERS.cdek.verifyCredentials(freshCdekCreds());
      assert.deepEqual(verdict, { status: "unavailable" });
      assert.equal(mock.calls.length, 0);
    } finally {
      mock.restore();
    }
  });
});

// ── Finding 2: CDEK 5xx classified from a numeric status, not the message text.

test("cdek verify: 503 retries and yields unavailable (numeric status, no string parsing)", async () => {
  await withEnv("CDEK_BASE_URL", CDEK_BASE_URL, async () => {
    const mock = installFetchMock(() => jsonResponse(503, { message: "later" }));
    try {
      const verdict =
        await VERIFY_CREDENTIALS_ADAPTERS.cdek.verifyCredentials(freshCdekCreds());
      assert.deepEqual(verdict, { status: "unavailable" });
      assert.equal(mock.calls.length, VERIFY_SERVER_ERROR_ATTEMPTS);
    } finally {
      mock.restore();
    }
  });
});

test("cdek token error: message text is unchanged and status rides as a property", async () => {
  const baseUrl = "https://cdek-verify-msg.test";
  const creds = freshCdekCreds();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("nope", { status: 503 });
  try {
    await assert.rejects(
      () => fetchCdekToken(baseUrl, creds),
      (error) => {
        assert.ok(error instanceof Error);
        // Byte-identical to the pre-change message.
        assert.equal(error.message, "CDEK token request failed: HTTP 503");
        assert.equal(error.status, 503);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ── Only a MEASURED code means bad credentials. Each test names the wire
// outcome it stands for, so a reader can tell what was measured from what was
// guessed.

test("yandex verify wire: 400 «pickups_not_configured» → ACCEPTED, not a rejection", async () => {
  // MEASURED 09.08 with the stored, valid credentials — five runs of six — while
  // the same pair produced working Express offers on the same screen. Refusing
  // this would deny a seller a carrier that works.
  await withEnv("YANDEX_DELIVERY_BASE_URL", YANDEX_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(400, {
        code: "pickups_not_configured",
        message: "Pickups are not configured for the warehouse",
      }),
    );
    try {
      const verdict =
        await VERIFY_CREDENTIALS_ADAPTERS.yataxi.verifyCredentials(YANDEX_CREDS);
      assert.deepEqual(verdict, { status: "accepted" });
      assert.equal(mock.calls.length, 1, "an answer, so no retry");
    } finally {
      mock.restore();
    }
  });
});

test("yandex verify wire: 400 with an unknown code → ACCEPTED, and no provider text escapes", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", YANDEX_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(400, { code: "some_future_code", message: "leak-me" }),
    );
    try {
      const verdict =
        await VERIFY_CREDENTIALS_ADAPTERS.yataxi.verifyCredentials(YANDEX_CREDS);
      assert.deepEqual(verdict, { status: "accepted" });
      assert.ok(!JSON.stringify(verdict).includes("leak-me"));
    } finally {
      mock.restore();
    }
  });
});

test("yandex verify wire: 400 with a non-JSON body → ACCEPTED", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", YANDEX_BASE_URL, async () => {
    const mock = installFetchMock(
      () => new Response("<html>gateway leak-me</html>", { status: 400 }),
    );
    try {
      const verdict =
        await VERIFY_CREDENTIALS_ADAPTERS.yataxi.verifyCredentials(YANDEX_CREDS);
      assert.deepEqual(verdict, { status: "accepted" });
      assert.ok(!JSON.stringify(verdict).includes("leak-me"));
    } finally {
      mock.restore();
    }
  });
});

test("yandex verify wire: 400 with no code field → ACCEPTED", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", YANDEX_BASE_URL, async () => {
    const mock = installFetchMock(() => jsonResponse(400, { message: "no code here" }));
    try {
      const verdict =
        await VERIFY_CREDENTIALS_ADAPTERS.yataxi.verifyCredentials(YANDEX_CREDS);
      assert.deepEqual(verdict, { status: "accepted" });
    } finally {
      mock.restore();
    }
  });
});

test("cdek verify: the secret never appears in the verdict", async () => {
  await withEnv("CDEK_BASE_URL", CDEK_BASE_URL, async () => {
    const creds = freshCdekCreds();
    const mock = installFetchMock(() => jsonResponse(401, { message: "nope" }));
    try {
      const verdict =
        await VERIFY_CREDENTIALS_ADAPTERS.cdek.verifyCredentials(creds);
      const serialized = JSON.stringify(verdict);
      assert.ok(!serialized.includes(creds.securePassword));
      assert.ok(!serialized.includes(creds.account));
    } finally {
      mock.restore();
    }
  });
});
