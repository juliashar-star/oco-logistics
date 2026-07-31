import assert from "node:assert/strict";
import test from "node:test";

import { CarrierQuoteChangedError } from "../packages/core/src/carrier-adapter/errors.ts";
import {
  buildClaimsCreateBody,
  confirmExpressOffer,
  deriveClaimsRequestId,
} from "../packages/core/src/carrier-adapter/yandex/express-client.ts";

const TEST_BASE_URL = "https://b2b.taxi.tst.yandex.net";
const VALID_CREDS = {
  platformStationId: "fbed3aa1-2cc6-4370-ab4d-59c5cc9bb924",
  token: "test-token",
};

const CLAIM_ID = "claim-id-32chars-abcdefghijklmnop";

const OFFER = {
  offerId: "payload-from-calculate-abc",
  expiresAt: "2099-01-01T12:00:00+00:00",
  deliveryIntervalFrom: "2099-01-01T14:00:00+00:00",
  deliveryIntervalTo: "2099-01-01T16:00:00+00:00",
  pickupIntervalFrom: "2099-01-01T12:00:00+00:00",
  pickupIntervalTo: "2099-01-01T13:00:00+00:00",
  priceRub: 547.78,
};

const INPUT = {
  clientNumber: "ORDER-42",
  providerKey: "yataxi",
  sender: {
    countryCode: "RU",
    contactName: "OCO Test Warehouse",
    phone: "+74950000000",
    email: "warehouse@example.com",
    city: "Москва",
    addressString: "ул Складская, 1",
  },
  recipient: {
    countryCode: "RU",
    contactName: "Иванов Иван",
    phone: "+79001234567",
    city: "Москва",
    addressString: "ул Тверская, д 1",
  },
  items: [
    {
      name: "Посылка",
      quantity: 1,
      unitPriceRub: 100,
      weightG: 1000,
      lengthCm: 30,
      widthCm: 20,
      heightCm: 10,
    },
  ],
};

const FAST_POLL = { pollIntervalMs: 1, pollBudgetMs: 80 };

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

function pathOf(url) {
  return String(url).replace(TEST_BASE_URL, "");
}

function isAccept(url) {
  return pathOf(url).startsWith("/b2b/cargo/integration/v2/claims/accept");
}

function isCancel(url) {
  return pathOf(url).startsWith("/b2b/cargo/integration/v2/claims/cancel");
}

function isInfo(url) {
  return pathOf(url).startsWith("/b2b/cargo/integration/v2/claims/info");
}

function isCreate(url) {
  return pathOf(url).startsWith("/b2b/cargo/integration/v2/claims/create");
}

function acceptCallCount(calls) {
  return calls.filter((c) => isAccept(c.url)).length;
}

function assertAcceptNeverCalled(calls) {
  assert.equal(
    acceptCallCount(calls),
    0,
    "claims/accept must never be called on a failure path (dispatches a courier)",
  );
}

function installFetchMock(handler) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body =
      init?.body !== undefined && init.body !== null && init.body !== ""
        ? JSON.parse(String(init.body))
        : undefined;
    calls.push({ url: String(url), init, body });
    return handler({ url: String(url), init, body, calls });
  };
  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

function readyInfo(priceRaw, version = 1) {
  return {
    id: CLAIM_ID,
    status: "ready_for_approval",
    version,
    pricing: {
      offer: {
        price_raw: priceRaw,
        price: String(Number(priceRaw) * 1.22),
      },
    },
  };
}

async function runConfirm(handler, options = FAST_POLL) {
  return withEnv("YANDEX_EXPRESS_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(handler);
    try {
      const result = await confirmExpressOffer(
        OFFER,
        INPUT,
        VALID_CREDS,
        "express",
        options,
      );
      return { result, mock };
    } catch (error) {
      error.mock = mock;
      throw error;
    } finally {
      mock.restore();
    }
  });
}

test("confirmExpressOffer happy path: create → two estimating → ready → accept", async () => {
  let infoCalls = 0;
  const acceptBody = {
    id: CLAIM_ID,
    status: "accepted",
    version: 2,
    user_request_revision: "1",
    skip_client_notify: false,
  };

  const { result, mock } = await runConfirm(({ url }) => {
    if (isCreate(url)) {
      return jsonResponse(200, { id: CLAIM_ID, status: "new", version: 1 });
    }
    if (isInfo(url)) {
      infoCalls += 1;
      if (infoCalls <= 2) {
        return jsonResponse(200, {
          id: CLAIM_ID,
          status: "estimating",
          version: 1,
        });
      }
      return jsonResponse(200, readyInfo(547.78, 1));
    }
    if (isAccept(url)) {
      return jsonResponse(200, acceptBody);
    }
    throw new Error(`unexpected url ${url}`);
  });

  assert.deepEqual(result, { requestId: CLAIM_ID, rawResponse: acceptBody });
  assert.equal(infoCalls, 3);
  assert.equal(
    mock.calls.filter((c) => isInfo(c.url)).length,
    3,
  );
  assert.equal(acceptCallCount(mock.calls), 1);
  assert.equal(mock.calls.filter((c) => isCancel(c.url)).length, 0);

  const createCall = mock.calls.find((c) => isCreate(c.url));
  assert.ok(createCall);
  assert.equal(
    createCall.url,
    `${TEST_BASE_URL}/b2b/cargo/integration/v2/claims/create?request_id=${encodeURIComponent(
      deriveClaimsRequestId(INPUT.clientNumber, OFFER.offerId),
    )}`,
  );
  assert.deepEqual(
    createCall.body,
    buildClaimsCreateBody(OFFER, INPUT, "express"),
  );
  assert.equal(
    new Headers(createCall.init.headers).get("Accept-Language"),
    "ru",
  );
});

test("confirmExpressOffer Accept-Language ru is present on create", async () => {
  const { mock } = await runConfirm(({ url }) => {
    if (isCreate(url)) {
      return jsonResponse(200, { id: CLAIM_ID, status: "new", version: 1 });
    }
    if (isInfo(url)) {
      return jsonResponse(200, readyInfo(547.78));
    }
    if (isAccept(url)) {
      return jsonResponse(200, { id: CLAIM_ID, status: "accepted", version: 1 });
    }
    throw new Error(`unexpected url ${url}`);
  });
  const createCall = mock.calls.find((c) => isCreate(c.url));
  assert.equal(
    new Headers(createCall.init.headers).get("Accept-Language"),
    "ru",
  );
});

test("confirmExpressOffer accepts a lower assessed price_raw", async () => {
  const { result, mock } = await runConfirm(({ url }) => {
    if (isCreate(url)) {
      return jsonResponse(200, { id: CLAIM_ID, status: "new", version: 1 });
    }
    if (isInfo(url)) {
      return jsonResponse(200, readyInfo(500));
    }
    if (isAccept(url)) {
      return jsonResponse(200, { id: CLAIM_ID, status: "accepted", version: 1 });
    }
    throw new Error(`unexpected url ${url}`);
  });
  assert.equal(result.requestId, CLAIM_ID);
  assert.equal(acceptCallCount(mock.calls), 1);
});

test("confirmExpressOffer price higher than quote → cancel, CarrierQuoteChangedError, accept never", async () => {
  let caught;
  try {
    await runConfirm(({ url }) => {
      if (isCreate(url)) {
        return jsonResponse(200, { id: CLAIM_ID, status: "new", version: 1 });
      }
      if (isInfo(url)) {
        return jsonResponse(200, readyInfo(600));
      }
      if (isCancel(url)) {
        return jsonResponse(200, { id: CLAIM_ID, status: "cancelled", version: 2 });
      }
      if (isAccept(url)) {
        return jsonResponse(200, { id: CLAIM_ID, status: "accepted" });
      }
      throw new Error(`unexpected url ${url}`);
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof CarrierQuoteChangedError);
  assertAcceptNeverCalled(caught.mock.calls);
  assert.equal(caught.mock.calls.filter((c) => isCancel(c.url)).length, 1);
});

test("confirmExpressOffer missing price_raw → cancel, CarrierQuoteChangedError, accept never", async () => {
  let caught;
  try {
    await runConfirm(({ url }) => {
      if (isCreate(url)) {
        return jsonResponse(200, { id: CLAIM_ID, status: "new", version: 1 });
      }
      if (isInfo(url)) {
        return jsonResponse(200, {
          id: CLAIM_ID,
          status: "ready_for_approval",
          version: 1,
          pricing: { offer: { price: "668.29" } },
        });
      }
      if (isCancel(url)) {
        return jsonResponse(200, { id: CLAIM_ID, status: "cancelled" });
      }
      if (isAccept(url)) {
        return jsonResponse(200, { id: CLAIM_ID, status: "accepted" });
      }
      throw new Error(`unexpected url ${url}`);
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof CarrierQuoteChangedError);
  assertAcceptNeverCalled(caught.mock.calls);
  assert.equal(caught.mock.calls.filter((c) => isCancel(c.url)).length, 1);
});

test("confirmExpressOffer estimating_failed → cancel, Error with error_messages, accept never", async () => {
  const messages = [{ code: "estimating.failed", message: "zone boom" }];
  let caught;
  try {
    await runConfirm(({ url }) => {
      if (isCreate(url)) {
        return jsonResponse(200, { id: CLAIM_ID, status: "new", version: 1 });
      }
      if (isInfo(url)) {
        return jsonResponse(200, {
          id: CLAIM_ID,
          status: "estimating_failed",
          version: 1,
          error_messages: messages,
        });
      }
      if (isCancel(url)) {
        return jsonResponse(200, { id: CLAIM_ID, status: "cancelled" });
      }
      if (isAccept(url)) {
        return jsonResponse(200, { id: CLAIM_ID, status: "accepted" });
      }
      throw new Error(`unexpected url ${url}`);
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof Error);
  assert.equal(caught instanceof CarrierQuoteChangedError, false);
  assert.match(caught.message, /estimating_failed/);
  assert.match(caught.message, /zone boom/);
  assertAcceptNeverCalled(caught.mock.calls);
  assert.equal(caught.mock.calls.filter((c) => isCancel(c.url)).length, 1);
});

test("confirmExpressOffer unexpected status → cancel, Error, accept never", async () => {
  let caught;
  try {
    await runConfirm(({ url }) => {
      if (isCreate(url)) {
        return jsonResponse(200, { id: CLAIM_ID, status: "new", version: 1 });
      }
      if (isInfo(url)) {
        return jsonResponse(200, {
          id: CLAIM_ID,
          status: "failed",
          version: 1,
        });
      }
      if (isCancel(url)) {
        return jsonResponse(200, { id: CLAIM_ID, status: "cancelled" });
      }
      if (isAccept(url)) {
        return jsonResponse(200, { id: CLAIM_ID, status: "accepted" });
      }
      throw new Error(`unexpected url ${url}`);
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof Error);
  assert.match(caught.message, /unexpected claim status/);
  assertAcceptNeverCalled(caught.mock.calls);
  assert.equal(caught.mock.calls.filter((c) => isCancel(c.url)).length, 1);
});

test("confirmExpressOffer poll budget exhausted → cancel, Error, accept never", async () => {
  let caught;
  try {
    await runConfirm(
      ({ url }) => {
        if (isCreate(url)) {
          return jsonResponse(200, { id: CLAIM_ID, status: "new", version: 1 });
        }
        if (isInfo(url)) {
          return jsonResponse(200, {
            id: CLAIM_ID,
            status: "estimating",
            version: 1,
          });
        }
        if (isCancel(url)) {
          return jsonResponse(200, { id: CLAIM_ID, status: "cancelled" });
        }
        if (isAccept(url)) {
          return jsonResponse(200, { id: CLAIM_ID, status: "accepted" });
        }
        throw new Error(`unexpected url ${url}`);
      },
      { pollIntervalMs: 5, pollBudgetMs: 20 },
    );
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof Error);
  assert.match(caught.message, /poll budget exhausted/);
  assertAcceptNeverCalled(caught.mock.calls);
  assert.equal(caught.mock.calls.filter((c) => isCancel(c.url)).length, 1);
});

test("confirmExpressOffer cancel failure still throws original error; accept never", async () => {
  let caught;
  try {
    await runConfirm(({ url }) => {
      if (isCreate(url)) {
        return jsonResponse(200, { id: CLAIM_ID, status: "new", version: 1 });
      }
      if (isInfo(url)) {
        return jsonResponse(200, readyInfo(999));
      }
      if (isCancel(url)) {
        return jsonResponse(500, { code: "cancel_boom" });
      }
      if (isAccept(url)) {
        return jsonResponse(200, { id: CLAIM_ID, status: "accepted" });
      }
      throw new Error(`unexpected url ${url}`);
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof CarrierQuoteChangedError);
  assertAcceptNeverCalled(caught.mock.calls);
});

test("confirmExpressOffer claims/info non-200 → cancel, accept never", async () => {
  let caught;
  try {
    await runConfirm(({ url }) => {
      if (isCreate(url)) {
        return jsonResponse(200, { id: CLAIM_ID, status: "new", version: 1 });
      }
      if (isInfo(url)) {
        return jsonResponse(500, { code: "info_boom" });
      }
      if (isCancel(url)) {
        return jsonResponse(200, { id: CLAIM_ID, status: "cancelled" });
      }
      if (isAccept(url)) {
        return jsonResponse(200, { id: CLAIM_ID, status: "accepted" });
      }
      throw new Error(`unexpected url ${url}`);
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof Error);
  assert.match(caught.message, /claims\/info failed/);
  assertAcceptNeverCalled(caught.mock.calls);
  assert.equal(caught.mock.calls.filter((c) => isCancel(c.url)).length, 1);
});

test("confirmExpressOffer claims/info malformed non-JSON → cancel, accept never", async () => {
  let caught;
  try {
    await runConfirm(({ url }) => {
      if (isCreate(url)) {
        return jsonResponse(200, { id: CLAIM_ID, status: "new", version: 1 });
      }
      if (isInfo(url)) {
        return {
          status: 200,
          ok: true,
          async text() {
            return "not-json{{{";
          },
          async json() {
            throw new Error("should use text()");
          },
        };
      }
      if (isCancel(url)) {
        return jsonResponse(200, { id: CLAIM_ID, status: "cancelled" });
      }
      if (isAccept(url)) {
        return jsonResponse(200, { id: CLAIM_ID, status: "accepted" });
      }
      throw new Error(`unexpected url ${url}`);
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof Error);
  assert.match(caught.message, /malformed/);
  assertAcceptNeverCalled(caught.mock.calls);
  assert.equal(caught.mock.calls.filter((c) => isCancel(c.url)).length, 1);
});

test("confirmExpressOffer accept 500 + info past accept → no cancel, message names claim id", async () => {
  let caught;
  try {
    await runConfirm(({ url, calls }) => {
      if (isCreate(url)) {
        return jsonResponse(200, { id: CLAIM_ID, status: "new", version: 1 });
      }
      if (isInfo(url)) {
        if (acceptCallCount(calls) > 0) {
          return jsonResponse(200, {
            id: CLAIM_ID,
            status: "performer_lookup",
            version: 3,
          });
        }
        return jsonResponse(200, readyInfo(547.78, 1));
      }
      if (isAccept(url)) {
        return jsonResponse(500, { code: "accept_boom" });
      }
      if (isCancel(url)) {
        return jsonResponse(200, { id: CLAIM_ID, status: "cancelled" });
      }
      throw new Error(`unexpected url ${url}`);
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof Error);
  assert.match(caught.message, new RegExp(CLAIM_ID));
  assert.match(caught.message, /may have been accepted/);
  assert.equal(caught.mock.calls.filter((c) => isCancel(c.url)).length, 0);
  assert.equal(acceptCallCount(caught.mock.calls), 1);
});
