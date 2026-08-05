import assert from "node:assert/strict";
import test from "node:test";

import {
  getOrderHistory,
  getOrderInfo,
} from "../packages/core/src/carrier-adapter/cdek/client.ts";

const SECRET = "cdek-secure-password-must-not-leak";
const PD_MARKER = "PD_LEAK_MARKER_xyz";
const PD_PHONE = "+79001112233";
const ORDER_UUID = "e7b9f786-bdf2-43a9-af93-415f7c43feab";

function credsFor(account) {
  return {
    account,
    securePassword: SECRET,
    contractType: "1",
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
    { access_token: "tok-tracking", expires_in: 3600 },
    { status: 200 },
  );
}

function notFoundUuidBody(uuid) {
  return {
    requests: [
      {
        type: "GET",
        date_time: "2026-08-05T11:08:57+0000",
        state: "INVALID",
        errors: [
          {
            code: "v2_entity_not_found",
            additional_code: "0x7B234F39",
            message: `Entity is not found by uuid ${uuid}`,
          },
        ],
      },
    ],
    related_entities: [],
  };
}

function invalidFormatBody(value) {
  return {
    requests: [
      {
        type: "GET",
        date_time: "2026-08-05T11:08:57+0000",
        state: "INVALID",
        errors: [
          {
            code: "v2_invalid_format",
            additional_code: "0x1E0EBE20",
            message: `Invalid value [${value}] in [uuid] parameter`,
          },
        ],
      },
    ],
    related_entities: [],
  };
}

/** Realistic entity with recipient PD markers — must never appear in events. */
function realisticOrderBody(statuses) {
  return {
    entity: {
      uuid: ORDER_UUID,
      cdek_number: "1109940740",
      number: "probe-tracking-1",
      recipient: {
        name: PD_MARKER,
        phones: [{ number: PD_PHONE }],
      },
      statuses,
    },
    requests: [
      {
        request_uuid: "req-1",
        type: "CREATE",
        state: "SUCCESSFUL",
      },
    ],
    related_entities: [],
  };
}

const TWO_STATUSES = [
  {
    code: "CREATED",
    name: "Создан",
    date_time: "2026-08-04T12:42:08+0000",
    city: "Офис СДЭК",
    deleted: false,
  },
  {
    code: "ACCEPTED",
    name: "Принят",
    date_time: "2026-08-04T12:42:04+0000",
    city: "Офис СДЭК",
    deleted: false,
  },
];

test("getOrderHistory: two statuses → two events with correct fields", async () => {
  const BASE = "https://cdek-tracking-two.test";
  const restore = installFetch(async (url) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) return oauthOk();
    if (href === `${BASE}/v2/orders/${ORDER_UUID}`) {
      return Response.json(realisticOrderBody(TWO_STATUSES), { status: 200 });
    }
    throw new Error(`unexpected url: ${href}`);
  });

  try {
    await withBaseUrl(BASE, async () => {
      const result = await getOrderHistory(ORDER_UUID, credsFor("acct-two"));
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.events.length, 2);
      assert.deepEqual(result.events[0], {
        statusCode: "CREATED",
        statusText: "Создан",
        eventAt: "2026-08-04T12:42:08+0000",
        raw: TWO_STATUSES[0],
      });
      assert.deepEqual(result.events[1], {
        statusCode: "ACCEPTED",
        statusText: "Принят",
        eventAt: "2026-08-04T12:42:04+0000",
        raw: TWO_STATUSES[1],
      });
    });
  } finally {
    restore();
  }
});

test("getOrderHistory: deleted:true status is skipped; others survive", async () => {
  const BASE = "https://cdek-tracking-deleted.test";
  const statuses = [
    {
      code: "DELIVERED",
      name: "Вручен",
      date_time: "2026-08-05T10:00:00+0000",
      deleted: true,
    },
    {
      code: "CREATED",
      name: "Создан",
      date_time: "2026-08-04T12:42:08+0000",
      deleted: false,
    },
    {
      code: "ACCEPTED",
      name: "Принят",
      date_time: "2026-08-04T12:42:04+0000",
      deleted: false,
    },
  ];
  const restore = installFetch(async (url) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) return oauthOk();
    if (href === `${BASE}/v2/orders/${ORDER_UUID}`) {
      return Response.json(realisticOrderBody(statuses), { status: 200 });
    }
    throw new Error(`unexpected url: ${href}`);
  });

  try {
    await withBaseUrl(BASE, async () => {
      const result = await getOrderHistory(ORDER_UUID, credsFor("acct-del"));
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.events.length, 2);
      assert.equal(result.events[0].statusCode, "CREATED");
      assert.equal(result.events[1].statusCode, "ACCEPTED");
      assert.equal(
        result.events.some((e) => e.statusCode === "DELIVERED"),
        false,
      );
    });
  } finally {
    restore();
  }
});

test("getOrderHistory: missing code or date_time → skipped", async () => {
  const BASE = "https://cdek-tracking-skip.test";
  const statuses = [
    {
      name: "no code",
      date_time: "2026-08-04T12:42:08+0000",
      deleted: false,
    },
    {
      code: "CREATED",
      name: "no date_time",
      deleted: false,
    },
    {
      code: "ACCEPTED",
      name: "Принят",
      date_time: "2026-08-04T12:42:04+0000",
      deleted: false,
    },
  ];
  const restore = installFetch(async (url) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) return oauthOk();
    if (href === `${BASE}/v2/orders/${ORDER_UUID}`) {
      return Response.json(realisticOrderBody(statuses), { status: 200 });
    }
    throw new Error(`unexpected url: ${href}`);
  });

  try {
    await withBaseUrl(BASE, async () => {
      const result = await getOrderHistory(ORDER_UUID, credsFor("acct-skip"));
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.events.length, 1);
      assert.equal(result.events[0].statusCode, "ACCEPTED");
    });
  } finally {
    restore();
  }
});

test("404 v2_entity_not_found → order_not_found for BOTH methods", async () => {
  const BASE = "https://cdek-tracking-404.test";
  const missing = "00000000-0000-4000-8000-000000000000";
  const restore = installFetch(async (url) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) return oauthOk();
    if (href === `${BASE}/v2/orders/${missing}`) {
      return Response.json(notFoundUuidBody(missing), { status: 404 });
    }
    throw new Error(`unexpected url: ${href}`);
  });

  try {
    await withBaseUrl(BASE, async () => {
      const history = await getOrderHistory(missing, credsFor("acct-404"));
      assert.deepEqual(history, { ok: false, reason: "order_not_found" });
      const info = await getOrderInfo(missing, credsFor("acct-404"));
      assert.deepEqual(info, { ok: false, reason: "order_not_found" });
    });
  } finally {
    restore();
  }
});

test("400 v2_invalid_format → throws; message has status NOT body", async () => {
  const BASE = "https://cdek-tracking-400.test";
  const badId = "not-a-uuid";
  const body = invalidFormatBody(badId);
  const restore = installFetch(async (url) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) return oauthOk();
    if (href === `${BASE}/v2/orders/${badId}`) {
      return Response.json(body, { status: 400 });
    }
    throw new Error(`unexpected url: ${href}`);
  });

  try {
    await withBaseUrl(BASE, async () => {
      await assert.rejects(
        () => getOrderHistory(badId, credsFor("acct-400")),
        (error) => {
          assert.equal(error instanceof Error, true);
          assert.match(error.message, /HTTP 400/);
          assert.equal(error.message.includes("v2_invalid_format"), false);
          assert.equal(error.message.includes("not-a-uuid"), false);
          assert.equal(error.message.includes(JSON.stringify(body)), false);
          return true;
        },
      );
      await assert.rejects(
        () => getOrderInfo(badId, credsFor("acct-400")),
        (error) => {
          assert.equal(error instanceof Error, true);
          assert.match(error.message, /HTTP 400/);
          assert.equal(error.message.includes("v2_invalid_format"), false);
          return true;
        },
      );
    });
  } finally {
    restore();
  }
});

test("statuses missing / not an array → throws malformed", async () => {
  const BASE = "https://cdek-tracking-malformed.test";
  let call = 0;
  const restore = installFetch(async (url) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) return oauthOk();
    if (href === `${BASE}/v2/orders/${ORDER_UUID}`) {
      call += 1;
      if (call === 1) {
        return Response.json(
          { entity: { uuid: ORDER_UUID }, requests: [] },
          { status: 200 },
        );
      }
      return Response.json(
        {
          entity: { uuid: ORDER_UUID, statuses: { code: "CREATED" } },
          requests: [],
        },
        { status: 200 },
      );
    }
    throw new Error(`unexpected url: ${href}`);
  });

  try {
    await withBaseUrl(BASE, async () => {
      await assert.rejects(
        () => getOrderHistory(ORDER_UUID, credsFor("acct-mal-1")),
        /malformed response \(statuses missing or not an array\)/,
      );
      await assert.rejects(
        () => getOrderHistory(ORDER_UUID, credsFor("acct-mal-2")),
        /malformed response \(statuses missing or not an array\)/,
      );
    });
  } finally {
    restore();
  }
});

test("getOrderInfo: trackingNumber from cdek_number; no trackingUrl; no plannedDelivery*", async () => {
  const BASE = "https://cdek-tracking-info.test";
  const restore = installFetch(async (url) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) return oauthOk();
    if (href === `${BASE}/v2/orders/${ORDER_UUID}`) {
      return Response.json(
        {
          ...realisticOrderBody(TWO_STATUSES),
          entity: {
            ...realisticOrderBody(TWO_STATUSES).entity,
            planned_delivery_date: "2026-08-10",
          },
        },
        { status: 200 },
      );
    }
    throw new Error(`unexpected url: ${href}`);
  });

  try {
    await withBaseUrl(BASE, async () => {
      const result = await getOrderInfo(ORDER_UUID, credsFor("acct-info"));
      assert.deepEqual(result, {
        ok: true,
        info: { trackingNumber: "1109940740" },
      });
      if (!result.ok) return;
      assert.equal("trackingUrl" in result.info, false);
      assert.equal("plannedDeliveryFrom" in result.info, false);
      assert.equal("plannedDeliveryTo" in result.info, false);
    });
  } finally {
    restore();
  }
});

test("[PD GUARD] serialised events contain neither PD marker nor phone", async () => {
  const BASE = "https://cdek-tracking-pd.test";
  const restore = installFetch(async (url) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) return oauthOk();
    if (href === `${BASE}/v2/orders/${ORDER_UUID}`) {
      return Response.json(realisticOrderBody(TWO_STATUSES), { status: 200 });
    }
    throw new Error(`unexpected url: ${href}`);
  });

  try {
    await withBaseUrl(BASE, async () => {
      const result = await getOrderHistory(ORDER_UUID, credsFor("acct-pd"));
      assert.equal(result.ok, true);
      if (!result.ok) return;
      const dumped = JSON.stringify(result.events);
      assert.equal(dumped.includes(PD_MARKER), false);
      assert.equal(dumped.includes(PD_PHONE), false);
      for (const event of result.events) {
        assert.equal(event.raw !== undefined, true);
        assert.equal(
          Object.prototype.hasOwnProperty.call(event.raw, "code"),
          true,
        );
        assert.equal(
          Object.prototype.hasOwnProperty.call(event.raw, "recipient"),
          false,
        );
      }
    });
  } finally {
    restore();
  }
});
