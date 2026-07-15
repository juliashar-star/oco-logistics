import assert from "node:assert/strict";
import test from "node:test";

import { toPickupPointsResponse } from "../apps/web/lib/shipments/pickup-point-dto.ts";

const EXPECTED_POINT_KEYS = [
  "id",
  "providerKey",
  "name",
  "address",
  "city",
  "latitude",
  "longitude",
];

test("mapped point key set is exactly the DTO fields (catches future spread of rawPoint)", () => {
  const response = toPickupPointsResponse("Москва", {
    points: [
      {
        id: "pt-1",
        providerKey: "yataxi",
        code: "should-not-leak",
        name: "ПВЗ",
        address: "ул. Тест, 1",
        city: "Москва",
        latitude: 55.75,
        longitude: 37.62,
        rawPoint: { huge: "payload", nested: { a: 1 } },
      },
    ],
    carriers: [{ providerKey: "yataxi", status: "ok" }],
  });

  assert.deepEqual(Object.keys(response.points[0]), EXPECTED_POINT_KEYS);
});

test("fat rawPoint and code never appear in serialized response", () => {
  const LEAK_MARKER = "RAW_POINT_LEAK_MARKER_abc99";
  const CODE_MARKER = "CODE_LEAK_MARKER_xyz88";

  const response = toPickupPointsResponse("Казань", {
    points: [
      {
        id: "pt-2",
        providerKey: "yataxi",
        code: CODE_MARKER,
        name: "Точка",
        address: "Адрес",
        city: "Казань",
        latitude: 55.8,
        longitude: 49.1,
        rawPoint: {
          marker: LEAK_MARKER,
          giant: "x".repeat(500),
          schedule: { mon: "9-21" },
        },
      },
    ],
    carriers: [
      {
        providerKey: "yataxi",
        status: "ok",
        resolvedLocation: { id: "geo-1", address: "Казань" },
      },
    ],
  });

  const serialized = JSON.stringify(response);
  assert.equal(serialized.includes(LEAK_MARKER), false);
  assert.equal(serialized.includes(CODE_MARKER), false);
  assert.equal(serialized.includes("rawPoint"), false);
  assert.equal(serialized.includes('"code"'), false);
});

test("failed carrier passes only providerKey and status", () => {
  const response = toPickupPointsResponse("Москва", {
    points: [],
    carriers: [{ providerKey: "beta", status: "failed" }],
  });

  assert.equal(response.carriers.length, 1);
  assert.deepEqual(Object.keys(response.carriers[0]).sort(), [
    "providerKey",
    "status",
  ]);
  assert.deepEqual(response.carriers[0], {
    providerKey: "beta",
    status: "failed",
  });
});

test("resolvedLocation kept when present, omitted when absent", () => {
  const response = toPickupPointsResponse("Москва", {
    points: [],
    carriers: [
      {
        providerKey: "alpha",
        status: "ok",
        resolvedLocation: { id: "geo-a", address: "Alpha City" },
      },
      { providerKey: "beta", status: "city_not_resolved" },
    ],
  });

  assert.deepEqual(response.carriers[0], {
    providerKey: "alpha",
    status: "ok",
    resolvedLocation: { id: "geo-a", address: "Alpha City" },
  });
  assert.deepEqual(response.carriers[1], {
    providerKey: "beta",
    status: "city_not_resolved",
  });
  assert.equal("resolvedLocation" in response.carriers[1], false);
});

test("empty result -> ok true, city, empty points and carriers", () => {
  const response = toPickupPointsResponse("Пустоград", {
    points: [],
    carriers: [],
  });
  assert.deepEqual(response, {
    ok: true,
    city: "Пустоград",
    points: [],
    carriers: [],
  });
});
