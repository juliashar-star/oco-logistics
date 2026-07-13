import assert from "node:assert/strict";
import test from "node:test";

import {
  YandexAuthError,
  YandexOfferExpiredError,
  confirmOffer,
} from "../packages/core/src/carrier-adapter/yandex/client.ts";

const TEST_BASE_URL = "https://b2b.taxi.tst.yandex.net";
const VALID_CREDS = {
  platformStationId: "fbed3aa1-2cc6-4370-ab4d-59c5cc9bb924",
  token: "test-token",
};
const OFFER_ID = "c1b139dbd76b4ee3b39b19180b516119";

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
      return JSON.stringify(body);
    },
  };
}

function installFetchMock(handler) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    return handler({ url, init, body, calls });
  };
  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

test("confirmOffer happy path: request_id maps to requestId", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const raw = { request_id: "77241d8009bb46d0bff5c65a73077bcd-udp" };
    const mock = installFetchMock(() => jsonResponse(200, raw));

    try {
      const result = await confirmOffer(OFFER_ID, VALID_CREDS);

      assert.equal(result.requestId, "77241d8009bb46d0bff5c65a73077bcd-udp");
      assert.deepEqual(result.rawResponse, raw);
    } finally {
      mock.restore();
    }
  });
});

test("confirmOffer request shape: POST /offers/confirm with { offer_id }", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(200, { request_id: "abc123-udp" }),
    );

    try {
      await confirmOffer(OFFER_ID, VALID_CREDS);

      assert.equal(mock.calls.length, 1);
      assert.equal(
        mock.calls[0].url,
        `${TEST_BASE_URL}/api/b2b/platform/offers/confirm`,
      );
      assert.equal(mock.calls[0].init.method, "POST");
      assert.deepEqual(mock.calls[0].body, { offer_id: OFFER_ID });
      assert.match(
        mock.calls[0].init.headers.Authorization,
        /^Bearer test-token$/,
      );
    } finally {
      mock.restore();
    }
  });
});

test("confirmOffer is retry-safe: same offer_id returns same request_id, no throw", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    // Mock the probe-verified dedupe: every confirm of this offer_id returns the SAME request_id.
    const SAME = "77241d8009bb46d0bff5c65a73077bcd-udp";
    const mock = installFetchMock(() => jsonResponse(200, { request_id: SAME }));
    try {
      const first = await confirmOffer(OFFER_ID, VALID_CREDS);
      const second = await confirmOffer(OFFER_ID, VALID_CREDS); // the retry
      assert.equal(first.requestId, SAME);
      assert.equal(second.requestId, SAME);
      assert.equal(first.requestId, second.requestId); // idempotent result
      assert.equal(mock.calls.length, 2); // both calls actually went out
    } finally {
      mock.restore();
    }
  });
});

test("confirmOffer missing request_id throws with response detail", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const raw = { code: "unexpected", message: "no id" };
    const mock = installFetchMock(() => jsonResponse(200, raw));

    try {
      await assert.rejects(
        () => confirmOffer(OFFER_ID, VALID_CREDS),
        (error) => {
          assert.match(error.message, /missing request_id/);
          assert.match(error.message, /200/);
          assert.match(error.message, /unexpected/);
          assert.match(error.message, /no id/);
          return true;
        },
      );
    } finally {
      mock.restore();
    }
  });
});

test("confirmOffer error status (expired/invalid offer) throws YandexOfferExpiredError", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const raw = {
      code: "offer_was_not_found",
      message: "Offer was not found or has expired",
    };
    const mock = installFetchMock(() => jsonResponse(400, raw));

    try {
      await assert.rejects(
        () => confirmOffer(OFFER_ID, VALID_CREDS),
        (error) => {
          assert.ok(error instanceof YandexOfferExpiredError);
          assert.match(error.message, /400/);
          assert.match(error.message, /offer_was_not_found/);
          assert.match(error.message, /Offer was not found or has expired/);
          return true;
        },
      );
    } finally {
      mock.restore();
    }
  });
});

test("confirmOffer other non-200 throws generic Error, not YandexOfferExpiredError", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const raw = { code: "some_other_error", message: "Something else failed" };
    const mock = installFetchMock(() => jsonResponse(400, raw));

    try {
      await assert.rejects(
        () => confirmOffer(OFFER_ID, VALID_CREDS),
        (error) => {
          assert.equal(error instanceof YandexOfferExpiredError, false);
          assert.equal(error instanceof YandexAuthError, false);
          assert.ok(error instanceof Error);
          assert.match(error.message, /400/);
          assert.match(error.message, /some_other_error/);
          assert.match(error.message, /Something else failed/);
          return true;
        },
      );
    } finally {
      mock.restore();
    }
  });
});

test("confirmOffer malformed non-JSON 400 body throws generic Error", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      status: 400,
      ok: false,
      async json() {
        throw new Error("should not call json");
      },
      async text() {
        return "not-json-body";
      },
    });

    try {
      await assert.rejects(
        () => confirmOffer(OFFER_ID, VALID_CREDS),
        (error) => {
          assert.equal(error instanceof YandexOfferExpiredError, false);
          assert.ok(error instanceof Error);
          assert.match(error.message, /400/);
          assert.match(error.message, /not-json-body/);
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("confirmOffer non-JSON body containing offer_was_not_found is NOT expired", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      status: 400,
      ok: false,
      async json() {
        throw new Error("should not call json");
      },
      async text() {
        return "garble offer_was_not_found garble";
      },
    });

    try {
      await assert.rejects(
        () => confirmOffer(OFFER_ID, VALID_CREDS),
        (error) => {
          assert.equal(error instanceof YandexOfferExpiredError, false);
          assert.ok(error instanceof Error);
          assert.match(error.message, /400/);
          assert.match(error.message, /garble offer_was_not_found garble/);
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("confirmOffer HTTP 401 throws YandexAuthError", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(() =>
      jsonResponse(401, { code: "401", message: "Unauthorized" }),
    );

    try {
      await assert.rejects(
        () => confirmOffer(OFFER_ID, VALID_CREDS),
        (error) => error instanceof YandexAuthError,
      );
    } finally {
      mock.restore();
    }
  });
});
