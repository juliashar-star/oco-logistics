import assert from "node:assert/strict";
import test from "node:test";

import {
  mapYandexDayOffs,
  mapYandexDeactivationDate,
  mapYandexIsDarkStore,
  mapYandexPickupPointQuality,
  mapYandexSchedule,
} from "../packages/core/src/carrier-adapter/yandex/map-pickup-point-quality.ts";
import { listPickupPoints } from "../packages/core/src/carrier-adapter/yandex/client.ts";

const TEST_BASE_URL = "https://b2b.taxi.tst.yandex.net";
const VALID_CREDS = {
  platformStationId: "fbed3aa1-2cc6-4370-ab4d-59c5cc9bb924",
  token: "test-token",
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
  globalThis.fetch = async (url, init) => handler({ url, init });
  return {
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() {
      return body;
    },
  };
}

// --- is_dark_store ---

test("isDarkStore: true → true", () => {
  assert.equal(mapYandexIsDarkStore(true), true);
});

test("isDarkStore: false / absent / null / wrong type → false", () => {
  assert.equal(mapYandexIsDarkStore(false), false);
  assert.equal(mapYandexIsDarkStore(undefined), false);
  assert.equal(mapYandexIsDarkStore(null), false);
  assert.equal(mapYandexIsDarkStore("true"), false);
  assert.equal(mapYandexIsDarkStore(1), false);
});

// --- deactivation_date ---

test("deactivationDate: non-empty string kept as-is", () => {
  assert.equal(mapYandexDeactivationDate("2026-08-01"), "2026-08-01");
});

test("deactivationDate: null / absent / wrong type / blank → null", () => {
  assert.equal(mapYandexDeactivationDate(null), null);
  assert.equal(mapYandexDeactivationDate(undefined), null);
  assert.equal(mapYandexDeactivationDate(123), null);
  assert.equal(mapYandexDeactivationDate(""), null);
  assert.equal(mapYandexDeactivationDate("   "), null);
});

// --- dayoffs trap ---

test("dayoffs: empty array → []", () => {
  assert.deepEqual(mapYandexDayOffs([]), []);
});

test("dayoffs: prefer date_utc string (docs say int, wire sends ISO string)", () => {
  assert.deepEqual(
    mapYandexDayOffs([
      { date: 1733356800, date_utc: "2024-12-05T00:00:00+0000" },
    ]),
    ["2024-12-05T00:00:00+0000"],
  );
});

test("dayoffs: fall back to numeric date (seconds) → accepted ISO string", () => {
  assert.deepEqual(mapYandexDayOffs([{ date: 1733356800 }]), [
    "2024-12-05T00:00:00.000Z",
  ]);
});

test("dayoffs: same magnitude as milliseconds (1000× seconds) is skipped, not far-future", () => {
  // 1733356800 as if it were already ms would be ~1970; use seconds*1000 so
  // treating it as seconds yields year ~56000 — must be rejected.
  assert.deepEqual(mapYandexDayOffs([{ date: 1733356800 * 1000 }]), []);
});

test("dayoffs: seconds-scale timestamp before year 2000 is skipped", () => {
  // 1990-01-01 UTC as unix seconds — plausible seconds unit, outside absolute range.
  assert.deepEqual(mapYandexDayOffs([{ date: Date.UTC(1990, 0, 1) / 1000 }]), []);
});

test("dayoffs: element with neither usable field is skipped", () => {
  assert.deepEqual(
    mapYandexDayOffs([{ date_utc: 1733356800 }, { other: true }, null]),
    [],
  );
});

test("dayoffs: absent / null / wrong type → []", () => {
  assert.deepEqual(mapYandexDayOffs(undefined), []);
  assert.deepEqual(mapYandexDayOffs(null), []);
  assert.deepEqual(mapYandexDayOffs("nope"), []);
  assert.deepEqual(mapYandexDayOffs({ date: 1 }), []);
});

test("dayoffs: 60 elements all with date_utc strings", () => {
  const items = Array.from({ length: 60 }, (_, i) => ({
    date: 1733356800 + i * 86400,
    date_utc: `2024-12-${String((i % 28) + 1).padStart(2, "0")}T00:00:00+0000`,
  }));
  const mapped = mapYandexDayOffs(items);
  assert.equal(mapped.length, 60);
  assert.equal(mapped[0], "2024-12-01T00:00:00+0000");
  assert.equal(mapped[59], items[59].date_utc);
});

// --- schedule ---

test("schedule: measured shape → structural entries", () => {
  assert.deepEqual(
    mapYandexSchedule({
      time_zone: 3,
      restrictions: [
        {
          days: [1, 2, 3, 4, 5],
          time_from: { hours: 9, minutes: 0 },
          time_to: { hours: 21, minutes: 0 },
        },
      ],
    }),
    {
      utcOffsetHours: 3,
      entries: [
        {
          weekdays: [1, 2, 3, 4, 5],
          from: { hours: 9, minutes: 0 },
          to: { hours: 21, minutes: 0 },
        },
      ],
    },
  );
});

test("schedule: absent / null / wrong type / missing time_zone → null", () => {
  assert.equal(mapYandexSchedule(undefined), null);
  assert.equal(mapYandexSchedule(null), null);
  assert.equal(mapYandexSchedule("nope"), null);
  assert.equal(mapYandexSchedule({ restrictions: [] }), null);
});

test("schedule: time_to null skips that restriction; empty usable → entries []", () => {
  assert.deepEqual(
    mapYandexSchedule({
      time_zone: 0,
      restrictions: [
        {
          days: [1],
          time_from: { hours: 0, minutes: 0 },
          time_to: null,
        },
      ],
    }),
    { utcOffsetHours: 0, entries: [] },
  );
});

// --- combined quality + whole mapper regression via listPickupPoints ---

test("mapYandexPickupPointQuality: measured four fields", () => {
  assert.deepEqual(
    mapYandexPickupPointQuality({
      is_dark_store: false,
      deactivation_date: null,
      dayoffs: [{ date: 1733356800, date_utc: "2024-12-05T00:00:00+0000" }],
      schedule: {
        time_zone: 3,
        restrictions: [
          {
            days: [1],
            time_from: { hours: 10, minutes: 0 },
            time_to: { hours: 18, minutes: 30 },
          },
        ],
      },
      available_for_dropoff: true,
    }),
    {
      isDarkStore: false,
      deactivationDate: null,
      dayOffs: ["2024-12-05T00:00:00+0000"],
      schedule: {
        utcOffsetHours: 3,
        entries: [
          {
            weekdays: [1],
            from: { hours: 10, minutes: 0 },
            to: { hours: 18, minutes: 30 },
          },
        ],
      },
    },
  );
});

test("mapYandexPickupPointQuality: all four absent → safe defaults", () => {
  assert.deepEqual(mapYandexPickupPointQuality({ id: "x" }), {
    isDarkStore: false,
    deactivationDate: null,
    dayOffs: [],
    schedule: null,
  });
});

test("mapYandexPickupPointQuality: all four wrong type → safe defaults", () => {
  assert.deepEqual(
    mapYandexPickupPointQuality({
      is_dark_store: "yes",
      deactivation_date: 42,
      dayoffs: { date: 1 },
      schedule: [],
    }),
    {
      isDarkStore: false,
      deactivationDate: null,
      dayOffs: [],
      schedule: null,
    },
  );
});

test("listPickupPoints: point with NONE of the four quality fields → valid CarrierPickupPoint", async () => {
  await withEnv("YANDEX_DELIVERY_BASE_URL", TEST_BASE_URL, async () => {
    const bare = {
      id: "bare-1",
      operator_station_id: "op-1",
      name: "Bare",
      type: "pickup_point",
      position: { latitude: 55.75, longitude: 37.61 },
      address: { locality: "г.Москва", full_address: "ул. Тест, 1" },
    };
    const mock = installFetchMock(({ url }) => {
      const path = String(url);
      if (path.includes("/location/detect")) {
        return jsonResponse(200, {
          variants: [{ geo_id: 213, address: "Москва" }],
        });
      }
      return jsonResponse(200, { points: [bare] });
    });
    try {
      const result = await listPickupPoints({ city: "Москва" }, VALID_CREDS);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.points.length, 1);
      const p = result.points[0];
      assert.equal(p.id, "bare-1");
      assert.equal(p.kind, "pickup_point");
      assert.equal(p.isDarkStore, false);
      assert.equal(p.deactivationDate, null);
      assert.deepEqual(p.dayOffs, []);
      assert.equal(p.schedule, null);
    } finally {
      mock.restore();
    }
  });
});
