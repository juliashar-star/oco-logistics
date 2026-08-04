import assert from "node:assert/strict";
import test from "node:test";

import {
  CDEK_CITY_CACHE_TTL_MS,
  parseCdekCities,
  resolveCdekCities,
} from "../packages/core/src/carrier-adapter/cdek/cities.ts";

const SECRET = "cdek-cities-secret-must-not-leak";

const CREDS = {
  account: "acct-cities",
  securePassword: SECRET,
  contractType: "1",
};

function setEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

async function withCdekBaseUrl(baseUrl, run) {
  const saved = process.env.CDEK_BASE_URL;
  setEnv("CDEK_BASE_URL", baseUrl);
  try {
    return await run();
  } finally {
    setEnv("CDEK_BASE_URL", saved);
  }
}

function installFetchMock(handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => handler(String(url), init);
  return {
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

function oauthThenCities(baseUrl, citiesHandler) {
  return async (href, init) => {
    if (href === `${baseUrl}/v2/oauth/token`) {
      return Response.json(
        { access_token: "tok-cities", expires_in: 3600 },
        { status: 200 },
      );
    }
    return citiesHandler(href, init);
  };
}

test("request URL is exact: country_codes=RU and encoded city", async () => {
  const baseUrl = "https://cdek-cities-url.test";
  /** @type {string[]} */
  const seen = [];
  const mock = installFetchMock(
    oauthThenCities(baseUrl, async (href) => {
      seen.push(href);
      return Response.json([], { status: 200 });
    }),
  );
  try {
    await withCdekBaseUrl(baseUrl, () =>
      resolveCdekCities("Москва", CREDS),
    );
  } finally {
    mock.restore();
  }
  assert.deepEqual(seen, [
    `${baseUrl}/v2/location/cities?country_codes=RU&city=%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0`,
  ]);
});

test("Москва → two rows, both returned, order preserved", async () => {
  const baseUrl = "https://cdek-cities-moscow.test";
  const body = [
    { code: 44, city: "Москва", region: "Москва" },
    { code: 1172673, city: "Москва", region: "Псковская область" },
  ];
  const mock = installFetchMock(
    oauthThenCities(baseUrl, async () =>
      Response.json(body, { status: 200 }),
    ),
  );
  try {
    const rows = await withCdekBaseUrl(baseUrl, () =>
      resolveCdekCities("Москва", CREDS),
    );
    assert.deepEqual(rows, [
      { code: 44, city: "Москва", region: "Москва" },
      { code: 1172673, city: "Москва", region: "Псковская область" },
    ]);
  } finally {
    mock.restore();
  }
});

test("nonsense name → [] and empty result IS cached (second call no refetch)", async () => {
  const baseUrl = "https://cdek-cities-empty.test";
  let citiesCalls = 0;
  const mock = installFetchMock(
    oauthThenCities(baseUrl, async () => {
      citiesCalls += 1;
      return Response.json([], { status: 200 });
    }),
  );
  try {
    await withCdekBaseUrl(baseUrl, async () => {
      const first = await resolveCdekCities("Нетакогогорода", CREDS);
      assert.deepEqual(first, []);
      const second = await resolveCdekCities("Нетакогогорода", CREDS);
      assert.deepEqual(second, []);
    });
  } finally {
    mock.restore();
  }
  assert.equal(citiesCalls, 1);
});

test("Королёв / Королев / королев share ONE cache entry — one fetch", async () => {
  const baseUrl = "https://cdek-cities-yo.test";
  let citiesCalls = 0;
  /** @type {string[]} */
  const seenUrls = [];
  const mock = installFetchMock(
    oauthThenCities(baseUrl, async (href) => {
      citiesCalls += 1;
      seenUrls.push(href);
      return Response.json(
        [
          { code: 205, city: "Королев", region: "Московская область" },
          { code: 1159502, city: "Королев", region: "Ростовская область" },
        ],
        { status: 200 },
      );
    }),
  );
  try {
    await withCdekBaseUrl(baseUrl, async () => {
      const a = await resolveCdekCities("Королёв", CREDS);
      const b = await resolveCdekCities("Королев", CREDS);
      const c = await resolveCdekCities("королев", CREDS);
      assert.equal(a.length, 2);
      assert.deepEqual(a, b);
      assert.deepEqual(b, c);
    });
  } finally {
    mock.restore();
  }
  assert.equal(citiesCalls, 1);
  assert.equal(seenUrls.length, 1);
  assert.match(seenUrls[0], /city=%D0%9A%D0%BE%D1%80%D0%BE%D0%BB%D1%91%D0%B2$/);
});

test("TTL: call after clock advances past TTL refetches", async () => {
  const baseUrl = "https://cdek-cities-ttl.test";
  let citiesCalls = 0;
  let nowMs = 1_000_000;
  const now = () => nowMs;
  const mock = installFetchMock(
    oauthThenCities(baseUrl, async () => {
      citiesCalls += 1;
      return Response.json(
        [{ code: 44, city: "Москва", region: "Москва" }],
        { status: 200 },
      );
    }),
  );
  try {
    await withCdekBaseUrl(baseUrl, async () => {
      await resolveCdekCities("Москва", CREDS, now);
      await resolveCdekCities("Москва", CREDS, now);
      assert.equal(citiesCalls, 1);
      nowMs += CDEK_CITY_CACHE_TTL_MS + 1;
      await resolveCdekCities("Москва", CREDS, now);
      assert.equal(citiesCalls, 2);
    });
  } finally {
    mock.restore();
  }
});

test("in-flight dedup: two concurrent callers, ONE fetch", async () => {
  const baseUrl = "https://cdek-cities-inflight.test";
  let resolveGate;
  const gate = new Promise((resolve) => {
    resolveGate = resolve;
  });
  let citiesCalls = 0;
  let citiesEntered = 0;
  const mock = installFetchMock(
    oauthThenCities(baseUrl, async () => {
      citiesEntered += 1;
      citiesCalls += 1;
      await gate;
      return Response.json(
        [{ code: 44, city: "Москва", region: "Москва" }],
        { status: 200 },
      );
    }),
  );
  try {
    await withCdekBaseUrl(baseUrl, async () => {
      const first = resolveCdekCities("Москва", CREDS);
      // Wait until the first caller is blocked inside the cities GET.
      while (citiesEntered === 0) {
        await new Promise((r) => setImmediate(r));
      }
      const second = resolveCdekCities("Москва", CREDS);
      resolveGate();
      const [a, b] = await Promise.all([first, second]);
      assert.deepEqual(a, [{ code: 44, city: "Москва", region: "Москва" }]);
      assert.deepEqual(b, a);
    });
  } finally {
    mock.restore();
  }
  assert.equal(citiesCalls, 1);
});

test("non-2xx throws; message has status but NOT the body", async () => {
  const baseUrl = "https://cdek-cities-500.test";
  const bodyHint = "echoed-city-field-must-not-leak";
  const mock = installFetchMock(
    oauthThenCities(baseUrl, async () =>
      new Response(JSON.stringify({ message: bodyHint, city: "Москва" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  try {
    await withCdekBaseUrl(baseUrl, async () => {
      await assert.rejects(
        () => resolveCdekCities("Москва", CREDS),
        (error) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /HTTP 500/);
          assert.equal(error.message.includes(bodyHint), false);
          assert.equal(error.message.includes("Москва"), false);
          assert.equal(error.message.includes(SECRET), false);
          return true;
        },
      );
    });
  } finally {
    mock.restore();
  }
});

test("malformed rows are skipped; good rows in the same array survive", () => {
  const rows = parseCdekCities([
    null,
    "x",
    { code: "44", city: "Москва", region: "Москва" },
    { code: "abc", city: "Москва", region: "Москва" },
    { code: 44, city: "", region: "Москва" },
    { code: Number.NaN, city: "Москва", region: "Москва" },
    { code: true, city: "Москва", region: "Москва" },
    { code: null, city: "Москва", region: "Москва" },
    { code: 44, city: "Москва", region: "Москва" },
    { code: 1172673, city: "Москва" },
    { code: 1542, city: "Урюпинск", region: 99 },
  ]);
  assert.deepEqual(rows, [
    { code: 44, city: "Москва", region: "Москва" },
    { code: 44, city: "Москва", region: "Москва" },
    { code: 1172673, city: "Москва", region: "" },
    { code: 1542, city: "Урюпинск", region: "" },
  ]);
});

test("empty or whitespace-only cityName returns [] without any network call", async () => {
  let fetchReached = false;
  const mock = installFetchMock(async () => {
    fetchReached = true;
    return new Response("should-not-run", { status: 500 });
  });
  try {
    assert.deepEqual(await resolveCdekCities("", CREDS), []);
    assert.deepEqual(await resolveCdekCities("   ", CREDS), []);
    assert.deepEqual(await resolveCdekCities("\t\n", CREDS), []);
  } finally {
    mock.restore();
  }
  assert.equal(fetchReached, false);
});

test("cache key includes baseUrl: same city under two CDEK_BASE_URL values → two fetches", async () => {
  const baseA = "https://cdek-cities-base-a.test";
  const baseB = "https://cdek-cities-base-b.test";
  let citiesCalls = 0;
  const mock = installFetchMock(async (href, init) => {
    if (href.endsWith("/v2/oauth/token")) {
      return Response.json(
        { access_token: "tok-base", expires_in: 3600 },
        { status: 200 },
      );
    }
    if (href.includes("/v2/location/cities")) {
      citiesCalls += 1;
      return Response.json(
        [{ code: 44, city: "Москва", region: "Москва" }],
        { status: 200 },
      );
    }
    throw new Error(`unexpected url: ${href}`);
  });
  try {
    await withCdekBaseUrl(baseA, () => resolveCdekCities("Москва", CREDS));
    await withCdekBaseUrl(baseB, () => resolveCdekCities("Москва", CREDS));
  } finally {
    mock.restore();
  }
  assert.equal(citiesCalls, 2);
});

test("city cache is keyed by baseUrl only — different accounts share one entry (deliberate: public reference data, not credentials)", async () => {
  const baseUrl = "https://cdek-cities-shared-account.test";
  const credsA = {
    account: "acct-A",
    securePassword: "secret-A-must-not-leak",
    contractType: "1",
  };
  const credsB = {
    account: "acct-B",
    securePassword: "secret-B-must-not-leak",
    contractType: "1",
  };
  let citiesCalls = 0;
  const mock = installFetchMock(async (href) => {
    if (href === `${baseUrl}/v2/oauth/token`) {
      return Response.json(
        { access_token: "tok-shared", expires_in: 3600 },
        { status: 200 },
      );
    }
    if (href.includes("/v2/location/cities")) {
      citiesCalls += 1;
      return Response.json(
        [{ code: 44, city: "Москва", region: "Москва" }],
        { status: 200 },
      );
    }
    throw new Error(`unexpected url: ${href}`);
  });
  try {
    await withCdekBaseUrl(baseUrl, async () => {
      const a = await resolveCdekCities("Москва", credsA);
      const b = await resolveCdekCities("Москва", credsB);
      assert.deepEqual(a, [
        { code: 44, city: "Москва", region: "Москва" },
      ]);
      assert.deepEqual(b, a);
    });
  } finally {
    mock.restore();
  }
  // Assert only cities: a cache hit returns before cdekGet, so account B never
  // reaches OAuth. (Token cache remains account-keyed when a fetch does run.)
  assert.equal(citiesCalls, 1);
});

test("cached cities array and rows are frozen — mutation throws; second call still intact", async () => {
  const baseUrl = "https://cdek-cities-frozen.test";
  const mock = installFetchMock(
    oauthThenCities(baseUrl, async () =>
      Response.json(
        [
          { code: 44, city: "Москва", region: "Москва" },
          { code: 1172673, city: "Москва", region: "Псковская область" },
        ],
        { status: 200 },
      ),
    ),
  );
  try {
    await withCdekBaseUrl(baseUrl, async () => {
      const first = await resolveCdekCities("Москва", CREDS);
      assert.equal(Object.isFrozen(first), true);
      assert.equal(Object.isFrozen(first[0]), true);
      assert.equal(Object.isFrozen(first[1]), true);

      assert.throws(() => {
        first.push({ code: 1, city: "x", region: "" });
      }, TypeError);
      assert.throws(() => {
        first.sort((a, b) => a.code - b.code);
      }, TypeError);
      assert.throws(() => {
        first[0].city = "mutated";
      }, TypeError);

      const second = await resolveCdekCities("Москва", CREDS);
      assert.deepEqual(second, [
        { code: 44, city: "Москва", region: "Москва" },
        { code: 1172673, city: "Москва", region: "Псковская область" },
      ]);
    });
  } finally {
    mock.restore();
  }
});

test("thrown error is NOT cached: the next call refetches", async () => {
  const baseUrl = "https://cdek-cities-nocache-err.test";
  let citiesCalls = 0;
  const mock = installFetchMock(
    oauthThenCities(baseUrl, async () => {
      citiesCalls += 1;
      if (citiesCalls === 1) {
        return new Response("boom-body-secret", { status: 503 });
      }
      return Response.json(
        [{ code: 44, city: "Москва", region: "Москва" }],
        { status: 200 },
      );
    }),
  );
  try {
    await withCdekBaseUrl(baseUrl, async () => {
      await assert.rejects(() => resolveCdekCities("Москва", CREDS), /HTTP 503/);
      const rows = await resolveCdekCities("Москва", CREDS);
      assert.deepEqual(rows, [
        { code: 44, city: "Москва", region: "Москва" },
      ]);
    });
  } finally {
    mock.restore();
  }
  assert.equal(citiesCalls, 2);
});
