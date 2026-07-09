import assert from "node:assert/strict";
import test from "node:test";

import {
  YandexAuthError,
  listPickupPoints,
} from "../packages/core/src/carrier-adapter/yandex/client.ts";

const TEST_BASE_URL = "https://b2b.taxi.tst.yandex.net";
const VALID_CREDS = {
  platformStationId: "fbed3aa1-2cc6-4370-ab4d-59c5cc9bb924",
  token: "test-token",
};
const CITY = "Москва";

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
    const body = init?.body ? JSON.parse(init.body) : undefined;
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

function samplePoint(id, overrides = {}) {
  return {
    id,
    operator_station_id: `station-${id}`,
    operator_id: "5post",
    name: `Point ${id}`,
    type: "pickup_point",
    position: { latitude: 55.75 + Number(id), longitude: 37.61 },
    address: {
      geoId: 117051,
      locality: "г.Москва",
      full_address: `г.Москва Example St. ${id}`,
    },
    ...overrides,
  };
}

function detectThenListMock({
  detectResponse = { variants: [{ geo_id: 213, address: CITY }] },
  listBody = { geo_id: 213, type: "pickup_point" },
  detectStatus = 200,
  listStatus = 200,
  listPoints,
}) {
  return ({ url, body }) => {
    if (url.endsWith("/location/detect")) {
      assert.deepEqual(body, { location: CITY });
      return jsonResponse(detectStatus, detectResponse);
    }
    if (url.endsWith("/pickup-points/list")) {
      assert.deepEqual(body, listBody);
      return jsonResponse(listStatus, { points: listPoints });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
}

test("happy path maps two pickup_point entries correctly", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const p1 = samplePoint("1");
    const p2 = samplePoint("2");
    const mock = installFetchMock(
      detectThenListMock({
        listPoints: [p1, p2],
      }),
    );

    try {
      const points = await listPickupPoints({ city: CITY }, VALID_CREDS);

      assert.equal(points.length, 2);
      assert.equal(points[0].id, "1");
      assert.equal(points[0].name, "Point 1");
      assert.equal(points[0].address, "г.Москва Example St. 1");
      assert.equal(points[0].city, "г.Москва");
      assert.equal(points[0].latitude, 56.75);
      assert.equal(points[0].longitude, 37.61);
      assert.equal(points[0].providerKey, "yataxi");
      assert.equal(points[1].id, "2");
    } finally {
      mock.restore();
    }
  });
});

test("detect and list request bodies are exact", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(
      detectThenListMock({
        listPoints: [samplePoint("1")],
      }),
    );

    try {
      await listPickupPoints({ city: CITY }, VALID_CREDS);

      assert.equal(mock.calls.length, 2);
      assert.deepEqual(mock.calls[0].body, { location: CITY });
      assert.deepEqual(mock.calls[1].body, { geo_id: 213, type: "pickup_point" });
    } finally {
      mock.restore();
    }
  });
});

test("terminal entries are filtered out defensively", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(
      detectThenListMock({
        listPoints: [
          samplePoint("1"),
          samplePoint("terminal-1", { type: "terminal", name: "Terminal" }),
        ],
      }),
    );

    try {
      const points = await listPickupPoints({ city: CITY }, VALID_CREDS);
      assert.equal(points.length, 1);
      assert.equal(points[0].id, "1");
    } finally {
      mock.restore();
    }
  });
});

test("empty detect variants returns empty array and skips list call", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(({ url }) => {
      if (url.endsWith("/location/detect")) {
        return jsonResponse(200, { variants: [] });
      }
      throw new Error("pickup-points/list should not be called");
    });

    try {
      const points = await listPickupPoints({ city: "UnknownCity" }, VALID_CREDS);
      assert.deepEqual(points, []);
      assert.equal(mock.calls.length, 1);
    } finally {
      mock.restore();
    }
  });
});

test("401 on detect throws YandexAuthError and list is never called", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(({ url }) => {
      if (url.endsWith("/location/detect")) {
        return jsonResponse(401, { code: "401", message: "Unauthorized" });
      }
      throw new Error("pickup-points/list should not be called");
    });

    try {
      await assert.rejects(
        () => listPickupPoints({ city: CITY }, VALID_CREDS),
        (error) => error instanceof YandexAuthError,
      );
      assert.equal(mock.calls.length, 1);
    } finally {
      mock.restore();
    }
  });
});

test("401 on list throws YandexAuthError", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(({ url }) => {
      if (url.endsWith("/location/detect")) {
        return jsonResponse(200, { variants: [{ geo_id: 213, address: CITY }] });
      }
      if (url.endsWith("/pickup-points/list")) {
        return jsonResponse(401, { code: "401", message: "Unauthorized" });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    try {
      await assert.rejects(
        () => listPickupPoints({ city: CITY }, VALID_CREDS),
        (error) => error instanceof YandexAuthError,
      );
      assert.equal(mock.calls.length, 2);
    } finally {
      mock.restore();
    }
  });
});

test("rawPoint contains the full raw point object", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const raw = samplePoint("1", { instruction: "Test instruction" });
    const mock = installFetchMock(
      detectThenListMock({
        listPoints: [raw],
      }),
    );

    try {
      const points = await listPickupPoints({ city: CITY }, VALID_CREDS);
      assert.deepEqual(points[0].rawPoint, raw);
    } finally {
      mock.restore();
    }
  });
});

test("limit and offset slice correctly", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const mock = installFetchMock(
      detectThenListMock({
        listPoints: [samplePoint("0"), samplePoint("1"), samplePoint("2")],
      }),
    );

    try {
      const points = await listPickupPoints({ city: CITY, offset: 1, limit: 1 }, VALID_CREDS);
      assert.equal(points.length, 1);
      assert.equal(points[0].id, "1");
    } finally {
      mock.restore();
    }
  });
});
