import assert from "node:assert/strict";
import test from "node:test";

import {
  CDEK_LIST_PICKUP_POINTS_MAX_CITY_MATCHES,
  listPickupPoints,
} from "../packages/core/src/carrier-adapter/cdek/client.ts";

const SECRET = "cdek-list-points-secret-must-not-leak";

const CREDS = {
  account: "acct-list-points",
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

function oauthOk(baseUrl) {
  return {
    url: `${baseUrl}/v2/oauth/token`,
    response: () =>
      Response.json(
        { access_token: "tok-list-points", expires_in: 3600 },
        { status: 200 },
      ),
  };
}

/** Minimal ACTIVE handout office row that mapCdekPickupPoints accepts. */
function officeRow(overrides = {}) {
  const code = overrides.code ?? "MSK65";
  const locationOverrides = overrides.location ?? {};
  const { location: _loc, ...rest } = overrides;
  return {
    code,
    name: `${code}, office`,
    type: "PVZ",
    status: "ACTIVE",
    is_handout: true,
    location: {
      country_code: "RU",
      region: "Москва",
      city: "Москва",
      longitude: 37.66,
      latitude: 55.73,
      address: "ул. Динамовская, 1А",
      ...locationOverrides,
    },
    ...rest,
  };
}

function citiesUrl(baseUrl, city) {
  return (
    `${baseUrl}/v2/location/cities?country_codes=RU&city=` +
    encodeURIComponent(city)
  );
}

function officesUrl(baseUrl, cityCode) {
  return `${baseUrl}/v2/deliverypoints?city_code=${cityCode}&is_handout=true`;
}

test("one match: exact office URL, mapped points, resolvedLocation Москва", async () => {
  const baseUrl = "https://cdek-lpp-one.test";
  const city = "ГородОдинМатч";
  /** @type {string[]} */
  const officeUrls = [];
  const mock = installFetchMock(async (href) => {
    if (href === oauthOk(baseUrl).url) {
      return oauthOk(baseUrl).response();
    }
    if (href === citiesUrl(baseUrl, city)) {
      return Response.json(
        [{ code: 44, city: "Москва", region: "Москва" }],
        { status: 200 },
      );
    }
    if (href.startsWith(`${baseUrl}/v2/deliverypoints`)) {
      officeUrls.push(href);
      return Response.json([officeRow({ code: "MSK65" })], { status: 200 });
    }
    throw new Error(`unexpected fetch: ${href}`);
  });
  try {
    const result = await withCdekBaseUrl(baseUrl, () =>
      listPickupPoints({ city }, CREDS),
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.resolvedLocation, {
      id: "44",
      address: "Москва",
    });
    assert.deepEqual(officeUrls, [officesUrl(baseUrl, 44)]);
    assert.equal(result.points.length, 1);
    assert.equal(result.points[0].id, "MSK65");
    assert.equal(result.points[0].providerKey, "cdek");
    assert.equal(result.points[0].address, "ул. Динамовская, 1А");
  } finally {
    mock.restore();
  }
});

test("two matches: parallel office calls, concat order, resolvedLocation list", async () => {
  const baseUrl = "https://cdek-lpp-two.test";
  const city = "ГородДваМатча";
  /** @type {string[]} */
  const officeUrls = [];
  const mock = installFetchMock(async (href) => {
    if (href === oauthOk(baseUrl).url) {
      return oauthOk(baseUrl).response();
    }
    if (href === citiesUrl(baseUrl, city)) {
      return Response.json(
        [
          { code: 44, city: "Москва", region: "Москва" },
          { code: 1172673, city: "Москва", region: "Псковская область" },
        ],
        { status: 200 },
      );
    }
    if (href === officesUrl(baseUrl, 44)) {
      officeUrls.push(href);
      return Response.json(
        [
          officeRow({
            code: "MSK44",
            location: { region: "Москва", city: "Москва", address: "ул. А, 1" },
          }),
        ],
        { status: 200 },
      );
    }
    if (href === officesUrl(baseUrl, 1172673)) {
      officeUrls.push(href);
      return Response.json(
        [
          officeRow({
            code: "PSK1",
            location: {
              region: "Псковская область",
              city: "Москва",
              address: "ул. Б, 2",
            },
          }),
        ],
        { status: 200 },
      );
    }
    throw new Error(`unexpected fetch: ${href}`);
  });
  try {
    const result = await withCdekBaseUrl(baseUrl, () =>
      listPickupPoints({ city }, CREDS),
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.resolvedLocation, {
      id: "44,1172673",
      address: "Москва / Москва, Псковская область",
    });
    assert.equal(officeUrls.length, 2);
    assert.ok(officeUrls.includes(officesUrl(baseUrl, 44)));
    assert.ok(officeUrls.includes(officesUrl(baseUrl, 1172673)));
    assert.deepEqual(
      result.points.map((p) => p.id),
      ["MSK44", "PSK1"],
    );
    assert.equal(result.points[0].address, "ул. А, 1");
    assert.equal(result.points[1].address, "Псковская область, ул. Б, 2");
  } finally {
    mock.restore();
  }
});

test("zero matches → city_not_resolved and NO office call", async () => {
  const baseUrl = "https://cdek-lpp-zero.test";
  const city = "ГородНольМатчей";
  let officeCalls = 0;
  const mock = installFetchMock(async (href) => {
    if (href === oauthOk(baseUrl).url) {
      return oauthOk(baseUrl).response();
    }
    if (href === citiesUrl(baseUrl, city)) {
      return Response.json([], { status: 200 });
    }
    if (href.startsWith(`${baseUrl}/v2/deliverypoints`)) {
      officeCalls += 1;
      throw new Error("office must not be called");
    }
    throw new Error(`unexpected fetch: ${href}`);
  });
  try {
    const result = await withCdekBaseUrl(baseUrl, () =>
      listPickupPoints({ city }, CREDS),
    );
    assert.deepEqual(result, { ok: false, reason: "city_not_resolved" });
    assert.equal(officeCalls, 0);
  } finally {
    mock.restore();
  }
});

test("six matches → city_not_resolved and NO office call", async () => {
  assert.equal(CDEK_LIST_PICKUP_POINTS_MAX_CITY_MATCHES, 5);
  const baseUrl = "https://cdek-lpp-six.test";
  const city = "ГородШестьМатчей";
  let officeCalls = 0;
  const six = Array.from({ length: 6 }, (_, i) => ({
    code: 1000 + i,
    city: `Город${i}`,
    region: `Регион${i}`,
  }));
  const mock = installFetchMock(async (href) => {
    if (href === oauthOk(baseUrl).url) {
      return oauthOk(baseUrl).response();
    }
    if (href === citiesUrl(baseUrl, city)) {
      return Response.json(six, { status: 200 });
    }
    if (href.startsWith(`${baseUrl}/v2/deliverypoints`)) {
      officeCalls += 1;
      throw new Error("office must not be called");
    }
    throw new Error(`unexpected fetch: ${href}`);
  });
  try {
    const result = await withCdekBaseUrl(baseUrl, () =>
      listPickupPoints({ city }, CREDS),
    );
    assert.deepEqual(result, { ok: false, reason: "city_not_resolved" });
    assert.equal(officeCalls, 0);
  } finally {
    mock.restore();
  }
});

test("one of two office calls returns 500 → throws status, not body; no partial", async () => {
  const baseUrl = "https://cdek-lpp-500.test";
  const city = "ГородОшибка500";
  const LEAK = "BODY_MUST_NOT_LEAK_xyz99";
  const mock = installFetchMock(async (href) => {
    if (href === oauthOk(baseUrl).url) {
      return oauthOk(baseUrl).response();
    }
    if (href === citiesUrl(baseUrl, city)) {
      return Response.json(
        [
          { code: 44, city: "Москва", region: "Москва" },
          { code: 1172673, city: "Москва", region: "Псковская область" },
        ],
        { status: 200 },
      );
    }
    if (href === officesUrl(baseUrl, 44)) {
      return Response.json([officeRow({ code: "MSK44" })], { status: 200 });
    }
    if (href === officesUrl(baseUrl, 1172673)) {
      return new Response(LEAK, { status: 500 });
    }
    throw new Error(`unexpected fetch: ${href}`);
  });
  try {
    await assert.rejects(
      () =>
        withCdekBaseUrl(baseUrl, () => listPickupPoints({ city }, CREDS)),
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /HTTP 500/);
        assert.equal(err.message.includes(LEAK), false);
        assert.equal(err.message.includes("MSK44"), false);
        return true;
      },
    );
  } finally {
    mock.restore();
  }
});

test("non-array office reply → throws malformed, not ok:true with []", async () => {
  const baseUrl = "https://cdek-lpp-malformed.test";
  const city = "ГородБитыйОтвет";
  const mock = installFetchMock(async (href) => {
    if (href === oauthOk(baseUrl).url) {
      return oauthOk(baseUrl).response();
    }
    if (href === citiesUrl(baseUrl, city)) {
      return Response.json(
        [{ code: 44, city: "Москва", region: "Москва" }],
        { status: 200 },
      );
    }
    if (href === officesUrl(baseUrl, 44)) {
      return Response.json({ points: [] }, { status: 200 });
    }
    throw new Error(`unexpected fetch: ${href}`);
  });
  try {
    await assert.rejects(
      () =>
        withCdekBaseUrl(baseUrl, () => listPickupPoints({ city }, CREDS)),
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /malformed/);
        return true;
      },
    );
  } finally {
    mock.restore();
  }
});

test("INACTIVE and is_handout false rows are dropped", async () => {
  const baseUrl = "https://cdek-lpp-filter.test";
  const city = "ГородФильтрОфисов";
  const mock = installFetchMock(async (href) => {
    if (href === oauthOk(baseUrl).url) {
      return oauthOk(baseUrl).response();
    }
    if (href === citiesUrl(baseUrl, city)) {
      return Response.json(
        [{ code: 44, city: "Москва", region: "Москва" }],
        { status: 200 },
      );
    }
    if (href === officesUrl(baseUrl, 44)) {
      return Response.json(
        [
          officeRow({ code: "DEAD1", status: "INACTIVE" }),
          officeRow({ code: "NOHAND", is_handout: false }),
          officeRow({ code: "GOOD1" }),
        ],
        { status: 200 },
      );
    }
    throw new Error(`unexpected fetch: ${href}`);
  });
  try {
    const result = await withCdekBaseUrl(baseUrl, () =>
      listPickupPoints({ city }, CREDS),
    );
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.points.map((p) => p.id),
      ["GOOD1"],
    );
  } finally {
    mock.restore();
  }
});

test("same office code under two city codes appears once (first kept)", async () => {
  const baseUrl = "https://cdek-lpp-dedupe.test";
  const city = "ГородДубльКода";
  const shared = officeRow({
    code: "SHARED1",
    location: { region: "Москва", city: "Москва", address: "ул. Первая, 1" },
  });
  const mock = installFetchMock(async (href) => {
    if (href === oauthOk(baseUrl).url) {
      return oauthOk(baseUrl).response();
    }
    if (href === citiesUrl(baseUrl, city)) {
      return Response.json(
        [
          { code: 44, city: "Москва", region: "Москва" },
          { code: 1172673, city: "Москва", region: "Псковская область" },
        ],
        { status: 200 },
      );
    }
    if (href === officesUrl(baseUrl, 44)) {
      return Response.json([shared], { status: 200 });
    }
    if (href === officesUrl(baseUrl, 1172673)) {
      return Response.json(
        [
          officeRow({
            code: "SHARED1",
            location: {
              region: "Псковская область",
              city: "Москва",
              address: "ул. Вторая, 2",
            },
          }),
          officeRow({
            code: "PSK-ONLY",
            location: {
              region: "Псковская область",
              city: "Москва",
              address: "ул. Третья, 3",
            },
          }),
        ],
        { status: 200 },
      );
    }
    throw new Error(`unexpected fetch: ${href}`);
  });
  try {
    const result = await withCdekBaseUrl(baseUrl, () =>
      listPickupPoints({ city }, CREDS),
    );
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.points.map((p) => p.id),
      ["SHARED1", "PSK-ONLY"],
    );
    assert.equal(result.points[0].address, "ул. Первая, 1");
  } finally {
    mock.restore();
  }
});

test("empty office array → ok:true with points: []", async () => {
  const baseUrl = "https://cdek-lpp-empty-offices.test";
  const city = "ГородБезОфисов";
  const mock = installFetchMock(async (href) => {
    if (href === oauthOk(baseUrl).url) {
      return oauthOk(baseUrl).response();
    }
    if (href === citiesUrl(baseUrl, city)) {
      return Response.json(
        [{ code: 44, city: "Москва", region: "Москва" }],
        { status: 200 },
      );
    }
    if (href === officesUrl(baseUrl, 44)) {
      return Response.json([], { status: 200 });
    }
    throw new Error(`unexpected fetch: ${href}`);
  });
  try {
    const result = await withCdekBaseUrl(baseUrl, () =>
      listPickupPoints({ city }, CREDS),
    );
    assert.deepEqual(result, {
      ok: true,
      resolvedLocation: { id: "44", address: "Москва" },
      points: [],
    });
  } finally {
    mock.restore();
  }
});

test("empty region → resolvedLocation.address is city alone (no trailing comma)", async () => {
  const baseUrl = "https://cdek-lpp-empty-region.test";
  const city = "ГородПустойРегион";
  const mock = installFetchMock(async (href) => {
    if (href === oauthOk(baseUrl).url) {
      return oauthOk(baseUrl).response();
    }
    if (href === citiesUrl(baseUrl, city)) {
      return Response.json(
        [{ code: 44, city: "Москва", region: "" }],
        { status: 200 },
      );
    }
    if (href === officesUrl(baseUrl, 44)) {
      return Response.json([], { status: 200 });
    }
    throw new Error(`unexpected fetch: ${href}`);
  });
  try {
    const result = await withCdekBaseUrl(baseUrl, () =>
      listPickupPoints({ city }, CREDS),
    );
    assert.equal(result.ok, true);
    assert.equal(result.resolvedLocation.address, "Москва");
    assert.equal(result.resolvedLocation.address.includes(","), false);
  } finally {
    mock.restore();
  }
});

test("whitespace-only region → resolvedLocation.address is city alone", async () => {
  const baseUrl = "https://cdek-lpp-ws-region.test";
  const city = "ГородПробельныйРегион";
  const mock = installFetchMock(async (href) => {
    if (href === oauthOk(baseUrl).url) {
      return oauthOk(baseUrl).response();
    }
    if (href === citiesUrl(baseUrl, city)) {
      return Response.json(
        [{ code: 44, city: "Москва", region: "   " }],
        { status: 200 },
      );
    }
    if (href === officesUrl(baseUrl, 44)) {
      return Response.json([], { status: 200 });
    }
    throw new Error(`unexpected fetch: ${href}`);
  });
  try {
    const result = await withCdekBaseUrl(baseUrl, () =>
      listPickupPoints({ city }, CREDS),
    );
    assert.equal(result.ok, true);
    assert.equal(result.resolvedLocation.address, "Москва");
    assert.equal(result.resolvedLocation.address.includes(","), false);
  } finally {
    mock.restore();
  }
});

test("two matches, second region empty → join unaffected", async () => {
  const baseUrl = "https://cdek-lpp-join-empty-region.test";
  const city = "ГородДжойнПустойРегион";
  const mock = installFetchMock(async (href) => {
    if (href === oauthOk(baseUrl).url) {
      return oauthOk(baseUrl).response();
    }
    if (href === citiesUrl(baseUrl, city)) {
      return Response.json(
        [
          { code: 44, city: "Москва", region: "Москва" },
          { code: 99, city: "Урюпинск", region: "" },
        ],
        { status: 200 },
      );
    }
    if (href === officesUrl(baseUrl, 44)) {
      return Response.json([], { status: 200 });
    }
    if (href === officesUrl(baseUrl, 99)) {
      return Response.json([], { status: 200 });
    }
    throw new Error(`unexpected fetch: ${href}`);
  });
  try {
    const result = await withCdekBaseUrl(baseUrl, () =>
      listPickupPoints({ city }, CREDS),
    );
    assert.equal(result.ok, true);
    assert.equal(result.resolvedLocation.address, "Москва / Урюпинск");
  } finally {
    mock.restore();
  }
});
