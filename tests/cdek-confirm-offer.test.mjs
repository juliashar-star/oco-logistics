import assert from "node:assert/strict";
import test from "node:test";

import { confirmOffer } from "../packages/core/src/carrier-adapter/cdek/client.ts";

const SECRET = "cdek-secure-password-must-not-leak";

const OFFER_136 = {
  offerId: "cdek:136",
  expiresAt: "",
  deliveryIntervalFrom: "",
  deliveryIntervalTo: "",
  pickupIntervalFrom: "",
  pickupIntervalTo: "",
  priceRub: 150,
  priceIsEstimate: true,
  serviceName: "Посылка склад-склад",
  rawOffer: { tariff_code: 136 },
};

const ITEM = {
  name: "Тестовая посылка",
  quantity: 1,
  unitPriceRub: 1000,
  weightG: 1000,
  lengthCm: 20,
  widthCm: 20,
  heightCm: 20,
};

function credsFor(account) {
  return {
    account,
    securePassword: SECRET,
    contractType: "1",
  };
}

function baseInput(clientNumber, overrides = {}) {
  return {
    clientNumber,
    providerKey: "cdek",
    sender: {
      countryCode: "RU",
      contactName: "Seller",
      phone: "+74951234567",
      city: "Москва",
    },
    recipient: {
      countryCode: "RU",
      contactName: "Тест Тестов",
      phone: "+79000000000",
      city: "Москва",
    },
    items: [ITEM],
    pointOutId: "MSK65",
    handoverMode: "DROP_OFF",
    ...overrides,
  };
}

function notFoundBody(number) {
  return {
    requests: [
      {
        type: "GET",
        state: "INVALID",
        errors: [
          {
            code: "v2_entity_not_found_im_number",
            message: `Entity is not found by number ${number}`,
          },
        ],
      },
    ],
    related_entities: [],
  };
}

function acceptedCreate(uuid) {
  return {
    entity: { uuid },
    requests: [
      {
        request_uuid: "req-create-1",
        type: "CREATE",
        state: "ACCEPTED",
      },
    ],
    related_entities: [],
  };
}

function successfulOrder(uuid, cdekNumber) {
  return {
    entity: {
      uuid,
      cdek_number: cdekNumber,
    },
    requests: [
      {
        request_uuid: "req-create-1",
        type: "CREATE",
        state: "SUCCESSFUL",
      },
    ],
    related_entities: [],
  };
}

function invalidOrder(uuid) {
  return {
    entity: { uuid },
    requests: [
      {
        request_uuid: "req-create-1",
        type: "CREATE",
        state: "INVALID",
        errors: [
          {
            code: "error_validate_receiver_delivery_point_is_empty",
            message: "Не задан офис получателя",
          },
        ],
      },
    ],
  };
}

async function withBaseUrl(baseUrl, run) {
  const saved = process.env.CDEK_BASE_URL;
  process.env.CDEK_BASE_URL = baseUrl;
  try {
    return await run();
  } finally {
    if (saved === undefined) {
      delete process.env.CDEK_BASE_URL;
    } else {
      process.env.CDEK_BASE_URL = saved;
    }
  }
}

function installFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = original;
  };
}

function oauthOk() {
  return Response.json(
    { access_token: "tok-confirm", expires_in: 3600 },
    { status: 200 },
  );
}

const NO_WAIT = {
  sleep: async () => {},
  pollIntervalMs: 1,
  pollBudgetMs: 15_000,
  pollMaxAttempts: 20,
};

test("happy path: not-found → POST once → poll pending then created", async () => {
  const BASE = "https://cdek-confirm-happy.test";
  const UUID = "e7b9f786-bdf2-43a9-af93-415f7c43feab";
  const clientNumber = "probe-happy-1";
  let postCalls = 0;
  let pollCalls = 0;
  const restore = installFetch(async (url, init) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) return oauthOk();
    if (href.includes("/v2/orders?im_number=")) {
      return Response.json(notFoundBody(clientNumber), { status: 400 });
    }
    if (href === `${BASE}/v2/orders` && init?.method === "POST") {
      postCalls += 1;
      return Response.json(acceptedCreate(UUID), { status: 202 });
    }
    if (href === `${BASE}/v2/orders/${UUID}`) {
      pollCalls += 1;
      if (pollCalls === 1) {
        return Response.json(acceptedCreate(UUID), { status: 200 });
      }
      return Response.json(successfulOrder(UUID, "1109940740"), {
        status: 200,
      });
    }
    throw new Error(`unexpected fetch ${href}`);
  });
  try {
    const result = await withBaseUrl(BASE, () =>
      confirmOffer(
        OFFER_136,
        baseInput(clientNumber),
        credsFor("acct-happy"),
        NO_WAIT,
      ),
    );
    assert.equal(result.requestId, UUID);
    assert.deepEqual(result.warnings, []);
    assert.equal(postCalls, 1);
  } finally {
    restore();
  }
});

test("adopt: lookup 200 with uuid → NO POST", async () => {
  const BASE = "https://cdek-confirm-adopt.test";
  const UUID = "9b25fc8b-1e52-40aa-8209-a6663577cb56";
  let postCalls = 0;
  const restore = installFetch(async (url, init) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) return oauthOk();
    if (href.includes("/v2/orders?im_number=")) {
      return Response.json(successfulOrder(UUID, "1109940665"), {
        status: 200,
      });
    }
    if (init?.method === "POST") {
      postCalls += 1;
    }
    throw new Error(`unexpected fetch ${href}`);
  });
  try {
    const result = await withBaseUrl(BASE, () =>
      confirmOffer(
        OFFER_136,
        baseInput("probe-adopt-1"),
        credsFor("acct-adopt"),
        NO_WAIT,
      ),
    );
    assert.equal(result.requestId, UUID);
    assert.equal(postCalls, 0);
  } finally {
    restore();
  }
});

test("existing order is invalid → throws, NO POST", async () => {
  const BASE = "https://cdek-confirm-invalid-lookup.test";
  const UUID = "ceb5432e-ace9-4baf-8345-806427864d9b";
  let postCalls = 0;
  const restore = installFetch(async (url, init) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) return oauthOk();
    if (href.includes("/v2/orders?im_number=")) {
      return Response.json(invalidOrder(UUID), { status: 200 });
    }
    if (init?.method === "POST") postCalls += 1;
    throw new Error(`unexpected fetch ${href}`);
  });
  try {
    await withBaseUrl(BASE, async () => {
      await assert.rejects(
        () =>
          confirmOffer(
            OFFER_136,
            baseInput("probe-invalid-lookup"),
            credsFor("acct-invalid-lookup"),
            NO_WAIT,
          ),
        (err) => {
          assert.ok(err instanceof Error);
          assert.match(
            err.message,
            /CDEK_ORDER_INVALID:.*error_validate_receiver_delivery_point_is_empty/,
          );
          assert.equal(err.message.includes("Не задан офис получателя"), false);
          return true;
        },
      );
    });
    assert.equal(postCalls, 0);
  } finally {
    restore();
  }
});

test("lookup returns 500 → throws, no POST", async () => {
  const BASE = "https://cdek-confirm-lookup500.test";
  let postCalls = 0;
  const restore = installFetch(async (url, init) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) return oauthOk();
    if (href.includes("/v2/orders?im_number=")) {
      return new Response(JSON.stringify({ errors: [{ message: "boom-secret" }] }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (init?.method === "POST") postCalls += 1;
    throw new Error(`unexpected fetch ${href}`);
  });
  try {
    await withBaseUrl(BASE, async () => {
      await assert.rejects(
        () =>
          confirmOffer(
            OFFER_136,
            baseInput("probe-lookup-500"),
            credsFor("acct-lookup-500"),
            NO_WAIT,
          ),
        (err) => {
          assert.ok(err instanceof Error);
          assert.equal(err.message, "CDEK order lookup failed: HTTP 500");
          assert.equal(err.message.includes("boom-secret"), false);
          return true;
        },
      );
    });
    assert.equal(postCalls, 0);
  } finally {
    restore();
  }
});

test("POST non-2xx → throws; message has status NOT body", async () => {
  const BASE = "https://cdek-confirm-post400.test";
  const clientNumber = "probe-post-fail";
  const restore = installFetch(async (url, init) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) return oauthOk();
    if (href.includes("/v2/orders?im_number=")) {
      return Response.json(notFoundBody(clientNumber), { status: 400 });
    }
    if (href === `${BASE}/v2/orders` && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          errors: [{ message: "provider-echo-should-not-leak" }],
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`unexpected fetch ${href}`);
  });
  try {
    await withBaseUrl(BASE, async () => {
      await assert.rejects(
        () =>
          confirmOffer(
            OFFER_136,
            baseInput(clientNumber),
            credsFor("acct-post-fail"),
            NO_WAIT,
          ),
        (err) => {
          assert.ok(err instanceof Error);
          assert.equal(err.message, "CDEK order create failed: HTTP 400");
          assert.equal(
            err.message.includes("provider-echo-should-not-leak"),
            false,
          );
          return true;
        },
      );
    });
  } finally {
    restore();
  }
});

test("poll settles invalid → throws codes only, no provider message", async () => {
  const BASE = "https://cdek-confirm-poll-invalid.test";
  const UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const clientNumber = "probe-poll-invalid";
  const restore = installFetch(async (url, init) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) return oauthOk();
    if (href.includes("/v2/orders?im_number=")) {
      return Response.json(notFoundBody(clientNumber), { status: 400 });
    }
    if (href === `${BASE}/v2/orders` && init?.method === "POST") {
      return Response.json(acceptedCreate(UUID), { status: 202 });
    }
    if (href === `${BASE}/v2/orders/${UUID}`) {
      return Response.json(invalidOrder(UUID), { status: 200 });
    }
    throw new Error(`unexpected fetch ${href}`);
  });
  try {
    await withBaseUrl(BASE, async () => {
      await assert.rejects(
        () =>
          confirmOffer(
            OFFER_136,
            baseInput(clientNumber),
            credsFor("acct-poll-invalid"),
            NO_WAIT,
          ),
        (err) => {
          assert.ok(err instanceof Error);
          assert.match(
            err.message,
            /CDEK_ORDER_INVALID:.*error_validate_receiver_delivery_point_is_empty/,
          );
          assert.equal(err.message.includes("Не задан офис получателя"), false);
          return true;
        },
      );
    });
  } finally {
    restore();
  }
});

test("poll never settles → success with uuid; exact poll count", async () => {
  const BASE = "https://cdek-confirm-poll-timeout.test";
  const UUID = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
  const clientNumber = "probe-poll-timeout";
  const MAX_ATTEMPTS = 3;
  let pollCalls = 0;
  const restore = installFetch(async (url, init) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) return oauthOk();
    if (href.includes("/v2/orders?im_number=")) {
      return Response.json(notFoundBody(clientNumber), { status: 400 });
    }
    if (href === `${BASE}/v2/orders` && init?.method === "POST") {
      return Response.json(acceptedCreate(UUID), { status: 202 });
    }
    if (href === `${BASE}/v2/orders/${UUID}`) {
      pollCalls += 1;
      return Response.json(acceptedCreate(UUID), { status: 200 });
    }
    throw new Error(`unexpected fetch ${href}`);
  });
  try {
    const result = await withBaseUrl(BASE, () =>
      confirmOffer(
        OFFER_136,
        baseInput(clientNumber),
        credsFor("acct-poll-timeout"),
        {
          sleep: async () => {},
          pollIntervalMs: 1,
          pollBudgetMs: 60_000,
          pollMaxAttempts: MAX_ATTEMPTS,
        },
      ),
    );
    assert.equal(result.requestId, UUID);
    assert.equal(pollCalls, MAX_ATTEMPTS);
  } finally {
    restore();
  }
});

test("POST succeeds, every poll 500 → resolves with uuid, does not throw", async () => {
  const BASE = "https://cdek-confirm-poll-500.test";
  const UUID = "dddddddd-eeee-ffff-aaaa-bbbbbbbbbbbb";
  const clientNumber = "probe-poll-500";
  const MAX_ATTEMPTS = 4;
  let pollCalls = 0;
  const restore = installFetch(async (url, init) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) return oauthOk();
    if (href.includes("/v2/orders?im_number=")) {
      return Response.json(notFoundBody(clientNumber), { status: 400 });
    }
    if (href === `${BASE}/v2/orders` && init?.method === "POST") {
      return Response.json(acceptedCreate(UUID), { status: 202 });
    }
    if (href === `${BASE}/v2/orders/${UUID}`) {
      pollCalls += 1;
      return new Response(JSON.stringify({ message: "should-not-leak" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch ${href}`);
  });
  try {
    const result = await withBaseUrl(BASE, () =>
      confirmOffer(
        OFFER_136,
        baseInput(clientNumber),
        credsFor("acct-poll-500"),
        {
          sleep: async () => {},
          pollIntervalMs: 1,
          pollBudgetMs: 60_000,
          pollMaxAttempts: MAX_ATTEMPTS,
        },
      ),
    );
    assert.equal(result.requestId, UUID);
    assert.equal(pollCalls, MAX_ATTEMPTS);
  } finally {
    restore();
  }
});

test("lookup 200 with nothing to adopt → CDEK_ORDER_LOOKUP_UNREADABLE", async () => {
  const BASE = "https://cdek-confirm-lookup-unreadable.test";
  let postCalls = 0;
  const restore = installFetch(async (url, init) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) return oauthOk();
    if (href.includes("/v2/orders?im_number=")) {
      // 200, no entity.uuid, no CREATE — nothing to adopt
      return Response.json({ entity: {}, requests: [] }, { status: 200 });
    }
    if (init?.method === "POST") postCalls += 1;
    throw new Error(`unexpected fetch ${href}`);
  });
  try {
    await withBaseUrl(BASE, async () => {
      await assert.rejects(
        () =>
          confirmOffer(
            OFFER_136,
            baseInput("probe-lookup-unreadable"),
            credsFor("acct-lookup-unreadable"),
            NO_WAIT,
          ),
        (err) => {
          assert.ok(err instanceof Error);
          assert.equal(err.message, "CDEK_ORDER_LOOKUP_UNREADABLE");
          assert.equal(err.message.includes("HTTP"), false);
          return true;
        },
      );
    });
    assert.equal(postCalls, 0);
  } finally {
    restore();
  }
});

test("lookup URL is exact, including encoding of the client number", async () => {
  const BASE = "https://cdek-confirm-encoding.test";
  const clientNumber = "probe/with spaces&x=1";
  const expectedLookup = `${BASE}/v2/orders?im_number=${encodeURIComponent(clientNumber)}`;
  /** @type {string | null} */
  let seenLookup = null;
  const UUID = "cccccccc-dddd-eeee-ffff-000000000000";
  const restore = installFetch(async (url) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) return oauthOk();
    if (href.includes("/v2/orders?im_number=")) {
      seenLookup = href;
      return Response.json(successfulOrder(UUID, "1109940999"), {
        status: 200,
      });
    }
    throw new Error(`unexpected fetch ${href}`);
  });
  try {
    await withBaseUrl(BASE, () =>
      confirmOffer(
        OFFER_136,
        baseInput(clientNumber),
        credsFor("acct-encoding"),
        NO_WAIT,
      ),
    );
    assert.equal(seenLookup, expectedLookup);
  } finally {
    restore();
  }
});
