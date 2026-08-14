import assert from "node:assert/strict";
import test from "node:test";

import { getOffers } from "../packages/core/src/carrier-adapter/cdek/client.ts";
import {
  CDEK_RECIPIENT_LOCATION_NOT_RECOGNIZED,
  CDEK_SENDER_LOCATION_NOT_RECOGNIZED,
  readCdekUnrecognizedLocationEnd,
  resolveCdekLocationCodes,
  withCdekLocationCode,
} from "../packages/core/src/carrier-adapter/cdek/location-fallback.ts";

const BASE_URL = "https://cdek-city.test";
const CREDS = {
  account: "acct-city",
  securePassword: "cdek-secure-password-must-not-leak",
  contractType: "1",
};

/** MEASURED calculator error envelope: bare top-level errors[], no requests[]. */
const calculatorError = (code) => ({
  errors: [
    {
      code,
      message:
        "Location is not recognized. Check your input data and try to provide more details",
    },
  ],
});

const TARIFFS = {
  tariff_codes: [
    {
      tariff_code: 136,
      tariff_name: "Посылка склад-склад",
      delivery_mode: 4,
      delivery_sum: 150,
      delivery_date_range: { min: "2026-08-20", max: "2026-08-21" },
    },
  ],
};

const SERVICES = {
  tariff_codes: [
    {
      tariff_code: "136",
      status: "true",
      result: {
        delivery_sum: 150,
        services: [{ code: "INSURANCE", sum: 7.5, total_sum: 9, vat_sum: 1.5 }],
      },
    },
  ],
};

const ITEM = {
  name: "Посылка",
  quantity: 1,
  unitPriceRub: 1000,
  weightG: 1000,
  lengthCm: 30,
  widthCm: 20,
  heightCm: 10,
};

function input(overrides = {}) {
  return {
    clientNumber: "ORDER-CITY-1",
    providerKey: "cdek",
    sender: { countryCode: "RU", contactName: "S", phone: "+70000000000", city: "Москва" },
    recipient: {
      countryCode: "RU",
      contactName: "R",
      phone: "+79000000000",
      city: "Санкт-Петербург",
    },
    items: [ITEM],
    pointOutId: "PVZ-1",
    handoverMode: "DROP_OFF",
    ...overrides,
  };
}

/**
 * Records every CALCULATOR call as { path, from_location, to_location } and
 * serves the city directory too.
 *
 * ASSERTIONS RUN ON THIS LOG, not on the returned offers: «did a retry happen,
 * and what exactly went out on it» is the behaviour under test.
 *
 * EACH TEST GETS ITS OWN baseUrl. resolveCdekCities caches for 24 h at module
 * scope keyed by baseUrl + city name, so a shared host would let one test's
 * directory answer serve the next one and silently skip the lookup.
 */
function installFetch(baseUrl, { calculator, cities }) {
  const calls = [];
  const cityQueries = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    const path = href.slice(baseUrl.length);
    if (path.startsWith("/v2/oauth/token")) {
      return Response.json({ access_token: "tok", expires_in: 3600 }, { status: 200 });
    }
    if (path.startsWith("/v2/location/cities")) {
      const name = decodeURIComponent(new URL(href).searchParams.get("city") ?? "");
      cityQueries.push(name);
      return Response.json(cities?.[name] ?? [], { status: 200 });
    }
    const body = JSON.parse(String(init?.body));
    calls.push({
      path,
      from_location: body.from_location,
      to_location: body.to_location,
    });
    return calculator(path, calls.length, body);
  };
  return {
    calls,
    cityQueries,
    restore() {
      globalThis.fetch = original;
    },
  };
}

async function withBaseUrl(baseUrl, run) {
  const saved = process.env.CDEK_BASE_URL;
  process.env.CDEK_BASE_URL = baseUrl;
  try {
    return await run();
  } finally {
    if (saved === undefined) delete process.env.CDEK_BASE_URL;
    else process.env.CDEK_BASE_URL = saved;
  }
}

const okReply = (path) =>
  path.endsWith("/tariffAndService")
    ? Response.json(SERVICES, { status: 200 })
    : Response.json(TARIFFS, { status: 200 });

const errorReply = (code) =>
  Response.json(calculatorError(code), { status: 400 });

/** Two calculator calls per attempt (tarifflist + tariffAndService). */
const attempts = (calls) => calls.length / 2;

// ── the name works → no retry at all ───────────────────────────────────────

test("name accepted → exactly one attempt, no code anywhere, directory untouched", async () => {
  const host = "https://cdek-city-ok.test";
  const fetchMock = installFetch(host, { calculator: (path) => okReply(path) });
  try {
    await withBaseUrl(host, async () => {
      const result = await getOffers(input(), CREDS);
      assert.equal(result.ok, true);
    });
  } finally {
    fetchMock.restore();
  }

  assert.equal(attempts(fetchMock.calls), 1);
  assert.deepEqual(fetchMock.cityQueries, [], "no city lookup when the name works");
  for (const call of fetchMock.calls) {
    assert.equal("code" in call.to_location, false);
    assert.equal("code" in call.from_location, false);
  }
});

// ── recipient named → one retry, code on the recipient only ────────────────

test("400 naming the RECIPIENT, one match → ONE retry carrying the code", async () => {
  const host = "https://cdek-city-recipient.test";
  const fetchMock = installFetch(host, {
    calculator: (path, n) =>
      n <= 2 ? errorReply(CDEK_RECIPIENT_LOCATION_NOT_RECOGNIZED) : okReply(path),
    cities: { "Санкт-Петербург": ONE_SPB, Москва: TWO_MSK },
  });
  try {
    await withBaseUrl(host, async () => {
      const result = await getOffers(input(), CREDS);
      assert.equal(result.ok, true);
    });
  } finally {
    fetchMock.restore();
  }

  assert.equal(attempts(fetchMock.calls), 2, "exactly one retry");
  const [first, , retry] = fetchMock.calls;
  assert.equal("code" in first.to_location, false, "first attempt goes by name");
  assert.equal(retry.to_location.code, 137);
  assert.equal(retry.to_location.city, "Санкт-Петербург", "city is kept, not replaced");
  // Sender is «Москва» — two matches — so it keeps its name.
  assert.equal("code" in retry.from_location, false);
});

test("400 naming the SENDER, one match → ONE retry carrying the sender code", async () => {
  const host = "https://cdek-city-sender.test";
  const fetchMock = installFetch(host, {
    calculator: (path, n) =>
      n <= 2 ? errorReply(CDEK_SENDER_LOCATION_NOT_RECOGNIZED) : okReply(path),
    cities: { "Санкт-Петербург": ONE_SPB, Екатеринбург: ONE_EKB },
  });
  try {
    await withBaseUrl(host, async () => {
      const result = await getOffers(
        input({
          sender: { countryCode: "RU", contactName: "S", phone: "+70000000000", city: "Санкт-Петербург" },
          recipient: { countryCode: "RU", contactName: "R", phone: "+79000000000", city: "Екатеринбург" },
        }),
        CREDS,
      );
      assert.equal(result.ok, true);
    });
  } finally {
    fetchMock.restore();
  }

  assert.equal(attempts(fetchMock.calls), 2);
  const retry = fetchMock.calls[2];
  assert.equal(retry.from_location.code, 137);
  // THE MEASURED CASE: both ends were broken and CDEK named only the sender.
  // One pass fixed both, because the fallback resolves both ends.
  assert.equal(retry.to_location.code, 250);
});

test("named end ambiguous → refusal, and NO retry is sent", async () => {
  const host = "https://cdek-city-ambiguous.test";
  const fetchMock = installFetch(host, {
    calculator: () => errorReply(CDEK_RECIPIENT_LOCATION_NOT_RECOGNIZED),
    cities: { Москва: TWO_MSK, "Санкт-Петербург": ONE_SPB },
  });
  try {
    await withBaseUrl(host, async () => {
      await assert.rejects(
        () =>
          getOffers(
            input({
              sender: { countryCode: "RU", contactName: "S", phone: "+70000000000", city: "Санкт-Петербург" },
              recipient: { countryCode: "RU", contactName: "R", phone: "+79000000000", city: "Москва" },
            }),
            CREDS,
          ),
        /CDEK_CITY_NOT_RESOLVED/,
      );
    });
  } finally {
    fetchMock.restore();
  }

  assert.equal(attempts(fetchMock.calls), 1, "no retry after a refusal");
});

test("named end unknown to the directory → refusal, no retry", async () => {
  const host = "https://cdek-city-unknown.test";
  const fetchMock = installFetch(host, {
    calculator: () => errorReply(CDEK_RECIPIENT_LOCATION_NOT_RECOGNIZED),
    cities: { Москва: TWO_MSK },
  });
  try {
    await withBaseUrl(host, async () => {
      await assert.rejects(
        () => getOffers(input({ recipient: { countryCode: "RU", contactName: "R", phone: "+79000000000", city: "Нетакогогорода" } }), CREDS),
        /CDEK_CITY_NOT_RESOLVED/,
      );
    });
  } finally {
    fetchMock.restore();
  }

  assert.equal(attempts(fetchMock.calls), 1);
});

test("400 with ANOTHER error code → no retry, no directory call, error as it was", async () => {
  const host = "https://cdek-city-other-error.test";
  const fetchMock = installFetch(host, {
    calculator: () => errorReply("v2_parameters_is_not_valid"),
    cities: { "Санкт-Петербург": ONE_SPB },
  });
  try {
    await withBaseUrl(host, async () => {
      await assert.rejects(
        () => getOffers(input(), CREDS),
        /CDEK get offers failed: HTTP 400/,
      );
    });
  } finally {
    fetchMock.restore();
  }

  assert.equal(attempts(fetchMock.calls), 1);
  assert.deepEqual(fetchMock.cityQueries, []);
});

test("the retry itself fails → refusal, and there is NO third attempt", async () => {
  const host = "https://cdek-city-retry-fails.test";
  const fetchMock = installFetch(host, {
    // Every attempt answers with the same location error.
    calculator: () => errorReply(CDEK_RECIPIENT_LOCATION_NOT_RECOGNIZED),
    cities: { "Санкт-Петербург": ONE_SPB, Москва: TWO_MSK },
  });
  try {
    await withBaseUrl(host, async () => {
      await assert.rejects(
        () => getOffers(input(), CREDS),
        /CDEK get offers failed: HTTP 400/,
      );
    });
  } finally {
    fetchMock.restore();
  }

  assert.equal(attempts(fetchMock.calls), 2, "one retry only — never a third attempt");
});

test("a failing tariffAndService also triggers the fallback", async () => {
  // The list call succeeds and the services call is the one refused — the retry
  // must still happen, because both replies are required for a price.
  const host = "https://cdek-city-services-fail.test";
  const fetchMock = installFetch(host, {
    calculator: (path, n) => {
      if (n <= 2) {
        return path.endsWith("/tariffAndService")
          ? errorReply(CDEK_RECIPIENT_LOCATION_NOT_RECOGNIZED)
          : okReply(path);
      }
      return okReply(path);
    },
    cities: { "Санкт-Петербург": ONE_SPB, Москва: TWO_MSK },
  });
  try {
    await withBaseUrl(host, async () => {
      const result = await getOffers(input(), CREDS);
      assert.equal(result.ok, true);
    });
  } finally {
    fetchMock.restore();
  }

  assert.equal(attempts(fetchMock.calls), 2);
  assert.equal(fetchMock.calls[2].to_location.code, 137);
});

// ── the decision rule, exercised directly on recorded resolver calls ────────

/** Directory stub: city name → rows, and it records what was asked. */
function cityStub(byCity) {
  const asked = [];
  return {
    asked,
    resolve: async (cityName) => {
      asked.push(cityName);
      return byCity[cityName] ?? [];
    },
  };
}

const ONE_SPB = [{ code: 137, city: "Санкт-Петербург", region: "Санкт-Петербург" }];
const ONE_EKB = [{ code: 250, city: "Екатеринбург", region: "Свердловская область" }];
const TWO_MSK = [
  { code: 44, city: "Москва", region: "Москва" },
  { code: 1172673, city: "Москва", region: "Псковская область" },
];

test("recipient named, both ends single → both codes returned", async () => {
  const stub = cityStub({ "Санкт-Петербург": ONE_SPB, Екатеринбург: ONE_EKB });
  const result = await resolveCdekLocationCodes({
    namedEnd: "recipient",
    senderCity: "Екатеринбург",
    recipientCity: "Санкт-Петербург",
    credentials: CREDS,
    resolveCities: stub.resolve,
  });
  assert.deepEqual(result, { ok: true, codes: { senderCode: 250, recipientCode: 137 } });
  assert.deepEqual(stub.asked.sort(), ["Екатеринбург", "Санкт-Петербург"]);
});

test("sender named, both ends single → ONE pass fixes both (the measured case)", async () => {
  // MEASURED: with both ends unrecognisable CDEK named only the SENDER. If the
  // fallback resolved just the named end, the retry would fail on the recipient
  // and there is no second retry.
  const stub = cityStub({ "Санкт-Петербург": ONE_SPB, Екатеринбург: ONE_EKB });
  const result = await resolveCdekLocationCodes({
    namedEnd: "sender",
    senderCity: "Санкт-Петербург",
    recipientCity: "Екатеринбург",
    credentials: CREDS,
    resolveCities: stub.resolve,
  });
  assert.deepEqual(result, { ok: true, codes: { senderCode: 137, recipientCode: 250 } });
});

test("named end has TWO matches → refusal, and no code is invented", async () => {
  const stub = cityStub({ Москва: TWO_MSK, "Санкт-Петербург": ONE_SPB });
  const result = await resolveCdekLocationCodes({
    namedEnd: "recipient",
    senderCity: "Санкт-Петербург",
    recipientCity: "Москва",
    credentials: CREDS,
    resolveCities: stub.resolve,
  });
  assert.deepEqual(result, { ok: false, reason: "city_not_resolved" });
});

test("named end has ZERO matches → refusal", async () => {
  const stub = cityStub({ "Санкт-Петербург": ONE_SPB });
  const result = await resolveCdekLocationCodes({
    namedEnd: "recipient",
    senderCity: "Санкт-Петербург",
    recipientCity: "Нетакогогорода",
    credentials: CREDS,
    resolveCities: stub.resolve,
  });
  assert.deepEqual(result, { ok: false, reason: "city_not_resolved" });
});

test("OTHER end ambiguous (Москва) → retry proceeds, that end keeps its NAME", async () => {
  // The ordinary route: sender «Москва» has two matches and works by name, so
  // refusing because of it would break what already works.
  const stub = cityStub({ Москва: TWO_MSK, "Санкт-Петербург": ONE_SPB });
  const result = await resolveCdekLocationCodes({
    namedEnd: "recipient",
    senderCity: "Москва",
    recipientCity: "Санкт-Петербург",
    credentials: CREDS,
    resolveCities: stub.resolve,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.codes, { recipientCode: 137 });
  assert.equal("senderCode" in result.codes, false);
});

test("no recipient city at all (PVZ order) → only the sender is asked", async () => {
  const stub = cityStub({ "Санкт-Петербург": ONE_SPB });
  const result = await resolveCdekLocationCodes({
    namedEnd: "sender",
    senderCity: "Санкт-Петербург",
    recipientCity: null,
    credentials: CREDS,
    resolveCities: stub.resolve,
  });
  assert.deepEqual(result, { ok: true, codes: { senderCode: 137 } });
  assert.deepEqual(stub.asked, ["Санкт-Петербург"]);
});

// ── which end the carrier named ────────────────────────────────────────────

test("reads the sender code out of the calculator envelope", () => {
  assert.equal(
    readCdekUnrecognizedLocationEnd(
      calculatorError(CDEK_SENDER_LOCATION_NOT_RECOGNIZED),
    ),
    "sender",
  );
});

test("reads the recipient code out of the calculator envelope", () => {
  assert.equal(
    readCdekUnrecognizedLocationEnd(
      calculatorError(CDEK_RECIPIENT_LOCATION_NOT_RECOGNIZED),
    ),
    "recipient",
  );
});

test("reads the same codes out of the ORDER request envelope", () => {
  // POST /v2/orders answers with requests[].errors[] — which envelope a
  // location error takes there is not measured, so both shapes are read.
  assert.equal(
    readCdekUnrecognizedLocationEnd({
      requests: [{ errors: [{ code: CDEK_SENDER_LOCATION_NOT_RECOGNIZED }] }],
    }),
    "sender",
  );
});

test("sender wins when both codes are present (measured precedence)", () => {
  assert.equal(
    readCdekUnrecognizedLocationEnd({
      errors: [
        { code: CDEK_RECIPIENT_LOCATION_NOT_RECOGNIZED },
        { code: CDEK_SENDER_LOCATION_NOT_RECOGNIZED },
      ],
    }),
    "sender",
  );
});

for (const [label, body] of [
  ["another CDEK error", calculatorError("v2_entity_not_found")],
  ["an empty errors array", { errors: [] }],
  ["errors not an array", { errors: "nope" }],
  ["no errors key", { tariff_codes: [] }],
  ["null", null],
  ["undefined", undefined],
  ["a string", "400"],
  ["a number", 400],
  ["an array", []],
]) {
  test(`${label} → not a location error`, () => {
    assert.equal(readCdekUnrecognizedLocationEnd(body), null);
  });
}

// ── the code is ADDED, never a replacement ─────────────────────────────────

test("withCdekLocationCode keeps city and address and adds code", () => {
  assert.deepEqual(
    withCdekLocationCode({ city: "Санкт-Петербург", address: "ул. Ленина, 1" }, 137),
    { city: "Санкт-Петербург", address: "ул. Ленина, 1", code: 137 },
  );
});

test("withCdekLocationCode without a code returns the location untouched", () => {
  const location = { city: "Москва", address: "Москва" };
  assert.equal(withCdekLocationCode(location, undefined), location);
});
