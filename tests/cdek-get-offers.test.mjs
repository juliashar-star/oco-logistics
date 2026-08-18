import assert from "node:assert/strict";
import test from "node:test";

import { getOffers } from "../packages/core/src/carrier-adapter/cdek/client.ts";

const SECRET = "cdek-secure-password-must-not-leak";
const BASE_URL = "https://cdek-offers.test";

const CREDS = {
  account: "acct-offers",
  securePassword: SECRET,
  contractType: "1",
};

const SENDER = {
  countryCode: "RU",
  contactName: "Seller",
  phone: "+74951234567",
  city: "Москва",
  addressString: "ул. Складская, 1",
};

const RECIPIENT_COURIER = {
  countryCode: "RU",
  contactName: "Иванов Иван",
  phone: "+79001234567",
  city: "Москва",
  addressString: "ул. Тверская, д. 1",
};

const ITEM = {
  name: "Посылка",
  quantity: 1,
  unitPriceRub: 1500,
  weightG: 1200,
  lengthCm: 30,
  widthCm: 20,
  heightCm: 10,
};

function baseInput(overrides = {}) {
  return {
    clientNumber: "ORDER-CDEK-1",
    providerKey: "cdek",
    sender: SENDER,
    recipient: RECIPIENT_COURIER,
    items: [ITEM],
    handoverMode: "DROP_OFF",
    ...overrides,
  };
}

/** Minimal tariff_codes covering delivery_mode 1–4 for mapper assertions. */
const MIXED_TARIFFS = {
  tariff_codes: [
    {
      tariff_code: 139,
      tariff_name: "Посылка дверь-дверь",
      delivery_mode: 1,
      delivery_sum: 440.0,
      delivery_date_range: { min: "2026-08-02", max: "2026-08-02" },
    },
    {
      tariff_code: 137,
      tariff_name: "Посылка склад-дверь",
      delivery_mode: 3,
      delivery_sum: 295.0,
      delivery_date_range: { min: "2026-08-02", max: "2026-08-02" },
    },
    {
      tariff_code: 136,
      tariff_name: "Посылка склад-склад",
      delivery_mode: 4,
      delivery_sum: 150.0,
      delivery_date_range: { min: "2026-08-02", max: "2026-08-02" },
    },
  ],
};

/** The MEASURED 13.08 service block, identical on every edu tariff at 1000 ₽. */
const INSURANCE_SERVICE = {
  code: "INSURANCE",
  sum: 7.5,
  total_sum: 9,
  discount_percent: 0,
  discount_sum: 0,
  vat_rate: 20,
  vat_sum: 1.5,
};

/**
 * tariffAndService reply for the same three codes.
 * MEASURED: tariff_code arrives as a STRING here and as a NUMBER in tarifflist;
 * status is the string "true"; there is no tariff_name and no delivery_mode.
 */
const MIXED_SERVICES = {
  tariff_codes: MIXED_TARIFFS.tariff_codes.map((row) => ({
    tariff_code: String(row.tariff_code),
    status: "true",
    result: {
      delivery_sum: row.delivery_sum,
      total_sum: row.delivery_sum * 1.2 + INSURANCE_SERVICE.total_sum,
      services: [INSURANCE_SERVICE],
    },
  })),
};

/** Route the two calculator calls the way the carrier does. */
function calculatorReply(url) {
  return String(url).endsWith("/v2/calculator/tariffAndService")
    ? MIXED_SERVICES
    : MIXED_TARIFFS;
}

async function withCdekBaseUrl(run) {
  const saved = process.env.CDEK_BASE_URL;
  process.env.CDEK_BASE_URL = BASE_URL;
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

test("empty items throws CDEK_INPUT_INVALID; tarifflist fetch never called", async () => {
  let tarifflistCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/v2/calculator/tarifflist")) {
      tarifflistCalls += 1;
    }
    return Response.json(
      { access_token: "tok-should-not-matter", expires_in: 3600 },
      { status: 200 },
    );
  };
  try {
    await withCdekBaseUrl(async () => {
      await assert.rejects(
        () => getOffers(baseInput({ items: [] }), CREDS),
        (error) => {
          assert.ok(error instanceof Error);
          assert.equal(
            error.message,
            "CDEK_INPUT_INVALID: at least one item is required",
          );
          return true;
        },
      );
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(tarifflistCalls, 0);
});

test("oauth then BOTH calculators with exact body fields", async () => {
  // The single-call version of this test pinned `href === …/tarifflist` and one
  // calculator call. The quote now needs two: tarifflist for the name and mode,
  // tariffAndService for the insurance the seller is actually charged. Every
  // assertion about the tarifflist BODY below is unchanged — only the call
  // contract moved, plus the new assertions on the second body.
  /** @type {unknown} */
  let tarifflistBody;
  /** @type {unknown} */
  let servicesBody;
  let oauthCalls = 0;
  let tarifflistCalls = 0;
  let servicesCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) {
      oauthCalls += 1;
      return Response.json(
        { access_token: "tok-offers", expires_in: 3600 },
        { status: 200 },
      );
    }
    assert.equal(init?.method, "POST");
    if (href === `${BASE_URL}/v2/calculator/tariffAndService`) {
      servicesCalls += 1;
      servicesBody = JSON.parse(String(init?.body));
      return Response.json(MIXED_SERVICES, { status: 200 });
    }
    assert.equal(href, `${BASE_URL}/v2/calculator/tarifflist`);
    tarifflistCalls += 1;
    tarifflistBody = JSON.parse(String(init?.body));
    return Response.json(MIXED_TARIFFS, { status: 200 });
  };
  try {
    await withCdekBaseUrl(async () => {
      const result = await getOffers(baseInput(), CREDS);
      assert.equal(result.ok, true);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(oauthCalls, 1);
  assert.equal(tarifflistCalls, 1);
  assert.equal(servicesCalls, 1);
  assert.deepEqual(tarifflistBody, {
    type: 1,
    currency: 1,
    lang: "rus",
    from_location: {
      city: "Москва",
      address: "ул. Складская, 1",
    },
    to_location: {
      city: "Москва",
      address: "ул. Тверская, д. 1",
    },
    packages: [{ weight: 1200, length: 30, width: 20, height: 10 }],
  });
  // CREDS is contract type 1 «Интернет-магазин», where the insurance fee is
  // charged automatically and asking for it is REFUSED — measured 18.08 on the
  // production contract: 37 of 38 rows came back status "false" with
  // ve_additional_service_unavailable. So the body is the SAME as tarifflist's,
  // with no services key at all. The earlier version of this assertion expected
  // services here; that expectation was built on the sandbox, where the request
  // happened to be accepted.
  assert.deepEqual(servicesBody, {
    type: 1,
    currency: 1,
    lang: "rus",
    from_location: {
      city: "Москва",
      address: "ул. Складская, 1",
    },
    to_location: {
      city: "Москва",
      address: "ул. Тверская, д. 1",
    },
    packages: [{ weight: 1200, length: 30, width: 20, height: 10 }],
  });
  // Key presence, not just deep equality — the point is that the field is
  // ABSENT, not that it is empty.
  assert.equal("services" in servicesBody, false);
});

test("contract type 2 DOES send INSURANCE with the real declared value", async () => {
  // «Доставка»: omitting it makes CDEK substitute parameter 1, and a parcel
  // insured for one rouble is uninsured.
  /** @type {any} */
  let servicesBody;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    if (href.endsWith("/v2/oauth/token")) {
      return Response.json(
        { access_token: "tok-type2-services", expires_in: 3600 },
        { status: 200 },
      );
    }
    if (href.endsWith("/v2/calculator/tariffAndService")) {
      servicesBody = JSON.parse(String(init?.body));
      return Response.json(MIXED_SERVICES, { status: 200 });
    }
    return Response.json(MIXED_TARIFFS, { status: 200 });
  };
  try {
    await withCdekBaseUrl(async () => {
      const result = await getOffers(baseInput(), {
        ...CREDS,
        contractType: "2",
      });
      assert.equal(result.ok, true);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(servicesBody.type, 2);
  assert.deepEqual(servicesBody.services, [
    { code: "INSURANCE", parameter: "1500" },
  ]);
  // ITEM.unitPriceRub is 1500 — the same number the order body sends as cost.
  assert.notEqual(servicesBody.services[0].parameter, "1");
});

test("the quoted price is delivery plus services, NET of VAT", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/v2/oauth/token")) {
      return Response.json(
        { access_token: "tok-price", expires_in: 3600 },
        { status: 200 },
      );
    }
    return Response.json(calculatorReply(url), { status: 200 });
  };
  try {
    await withCdekBaseUrl(async () => {
      const result = await getOffers(baseInput({ handoverMode: "COURIER" }), CREDS);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      // 139 «Посылка дверь-дверь»: 440 carriage + 7.5 insurance. NOT total_sum,
      // which carries VAT — that is a display decision for every carrier at once.
      assert.deepEqual(
        result.offers.map((o) => [o.offerId, o.priceRub]),
        [["cdek:139", 447.5]],
      );
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("either calculator failing means no CDEK offers — never the bare price", async () => {
  for (const failing of [
    "/v2/calculator/tarifflist",
    "/v2/calculator/tariffAndService",
  ]) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const href = String(url);
      if (href.endsWith("/v2/oauth/token")) {
        return Response.json(
          { access_token: "tok-half", expires_in: 3600 },
          { status: 200 },
        );
      }
      if (href.endsWith(failing)) {
        return new Response("{}", { status: 500 });
      }
      return Response.json(calculatorReply(url), { status: 200 });
    };
    try {
      await withCdekBaseUrl(async () => {
        await assert.rejects(
          () => getOffers(baseInput(), CREDS),
          (error) => {
            assert.ok(error instanceof Error);
            assert.match(error.message, /HTTP 500/);
            return true;
          },
          `${failing} failing must throw, not fall back to the understated price`,
        );
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
});

test("a tariff missing from tariffAndService is dropped, not priced without insurance", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/v2/oauth/token")) {
      return Response.json(
        { access_token: "tok-partial", expires_in: 3600 },
        { status: 200 },
      );
    }
    if (String(url).endsWith("/v2/calculator/tariffAndService")) {
      // 139 is absent from the services reply entirely.
      return Response.json(
        {
          tariff_codes: MIXED_SERVICES.tariff_codes.filter(
            (row) => row.tariff_code !== "139",
          ),
        },
        { status: 200 },
      );
    }
    return Response.json(MIXED_TARIFFS, { status: 200 });
  };
  try {
    await withCdekBaseUrl(async () => {
      const result = await getOffers(baseInput({ handoverMode: "COURIER" }), CREDS);
      assert.deepEqual(result, { ok: false, reason: "no_delivery_options" });
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("PVZ input: to_location.address equals city; deliveryMode 4 reaches mapper", async () => {
  /** @type {unknown} */
  let tarifflistBody;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/v2/oauth/token")) {
      return Response.json(
        { access_token: "tok-pvz", expires_in: 3600 },
        { status: 200 },
      );
    }
    // Both calculators answer; only the tarifflist body is captured, which is
    // what this test asserts about. Expectations below are unchanged.
    if (String(url).endsWith("/v2/calculator/tarifflist")) {
      tarifflistBody = JSON.parse(String(init?.body));
    }
    return Response.json(calculatorReply(url), { status: 200 });
  };
  try {
    await withCdekBaseUrl(async () => {
      const result = await getOffers(
        baseInput({
          pointOutId: "CDEK-PVZ-42",
          recipient: {
            countryCode: "RU",
            contactName: "Иванов Иван",
            phone: "+79001234567",
            city: "Москва",
            // no addressString — PVZ destination
          },
          handoverMode: "DROP_OFF",
        }),
        CREDS,
      );
      assert.equal(result.ok, true);
      if (!result.ok) return;
      // Only delivery_mode 4 rows survive the mapper filter.
      assert.deepEqual(
        result.offers.map((o) => o.offerId),
        ["cdek:136"],
      );
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(
    /** @type {{ to_location: { address: string } }} */ (tarifflistBody)
      .to_location.address,
    "Москва",
  );
});

test("COURIER + DROP_OFF → deliveryMode 3; COURIER handover → deliveryMode 1", async () => {
  const originalFetch = globalThis.fetch;

  async function runWithHandover(handoverMode) {
    globalThis.fetch = async (url) => {
      if (String(url).endsWith("/v2/oauth/token")) {
        return Response.json(
          { access_token: "tok-mode", expires_in: 3600 },
          { status: 200 },
        );
      }
      return Response.json(calculatorReply(url), { status: 200 });
    };
    return withCdekBaseUrl(() =>
      getOffers(baseInput({ handoverMode }), CREDS),
    );
  }

  try {
    const dropOff = await runWithHandover("DROP_OFF");
    assert.equal(dropOff.ok, true);
    if (!dropOff.ok) return;
    assert.deepEqual(
      dropOff.offers.map((o) => o.offerId),
      ["cdek:137"],
    );

    const courier = await runWithHandover("COURIER");
    assert.equal(courier.ok, true);
    if (!courier.ok) return;
    assert.deepEqual(
      courier.offers.map((o) => o.offerId),
      ["cdek:139"],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('contractType "2" is sent as type 2', async () => {
  /** @type {unknown} */
  let tarifflistBody;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/v2/oauth/token")) {
      return Response.json(
        { access_token: "tok-type2", expires_in: 3600 },
        { status: 200 },
      );
    }
    if (String(url).endsWith("/v2/calculator/tarifflist")) {
      tarifflistBody = JSON.parse(String(init?.body));
    }
    return Response.json(calculatorReply(url), { status: 200 });
  };
  try {
    await withCdekBaseUrl(async () => {
      await getOffers(baseInput(), { ...CREDS, contractType: "2" });
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(/** @type {{ type: number }} */ (tarifflistBody).type, 2);
});

test("empty tariff_codes → no_delivery_options", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/v2/oauth/token")) {
      return Response.json(
        { access_token: "tok-empty", expires_in: 3600 },
        { status: 200 },
      );
    }
    return Response.json({ tariff_codes: [] }, { status: 200 });
  };
  try {
    await withCdekBaseUrl(async () => {
      const result = await getOffers(baseInput(), CREDS);
      assert.deepEqual(result, {
        ok: false,
        reason: "no_delivery_options",
      });
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HTTP 400 from tarifflist throws; message has neither body nor securePassword", async () => {
  const bodyHint = "leaked-error-body-with-secret";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/v2/oauth/token")) {
      return Response.json(
        { access_token: "tok-400", expires_in: 3600 },
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ message: bodyHint, hint: SECRET }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    await withCdekBaseUrl(async () => {
      await assert.rejects(
        () => getOffers(baseInput(), CREDS),
        (error) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /HTTP 400/);
          assert.equal(error.message.includes(bodyHint), false);
          assert.equal(error.message.includes(SECRET), false);
          assert.equal(error.message.includes("leaked-error"), false);
          return true;
        },
      );
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
