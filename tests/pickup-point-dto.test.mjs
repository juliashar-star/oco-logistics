import assert from "node:assert/strict";
import test from "node:test";

import { providerSellerDisplayName } from "../packages/core/src/carrier-adapter/provider-seller-display-names.ts";
import { toPickupPointsResponse } from "../apps/web/lib/shipments/pickup-point-dto.ts";

const EXPECTED_POINT_KEYS = [
  "id",
  "providerKey",
  "name",
  "address",
  "city",
  "latitude",
  "longitude",
  "kind",
  "isDarkStore",
  "carrierName",
];

/** Fake resolver — does not touch the real map (same pattern as offer-dto). */
function fakeResolveCarrierName(providerKey) {
  return `NAME_FOR:${providerKey}`;
}

function mapPoints(city, result) {
  return toPickupPointsResponse(city, result, fakeResolveCarrierName);
}

const BASE_POINT = {
  id: "pt-1",
  providerKey: "yataxi",
  code: "should-not-leak",
  name: "ПВЗ",
  address: "ул. Тест, 1",
  city: "Москва",
  latitude: 55.75,
  longitude: 37.62,
  kind: "pickup_point",
  isDarkStore: false,
  deactivationDate: null,
  dayOffs: [],
  schedule: null,
  rawPoint: { huge: "payload", nested: { a: 1 } },
};

test("mapped point key set is exactly the DTO fields (catches future spread of rawPoint)", () => {
  const response = mapPoints("Москва", {
    points: [BASE_POINT],
    carriers: [{ providerKey: "yataxi", status: "ok" }],
  });

  assert.deepEqual(Object.keys(response.points[0]), EXPECTED_POINT_KEYS);
  assert.equal(response.points[0].kind, "pickup_point");
  assert.equal(response.points[0].isDarkStore, false);
  assert.equal(response.points[0].carrierName, "NAME_FOR:yataxi");
  assert.equal(
    EXPECTED_POINT_KEYS[EXPECTED_POINT_KEYS.length - 1],
    "carrierName",
  );
});

test("fat rawPoint and code never appear in serialized response", () => {
  const LEAK_MARKER = "RAW_POINT_LEAK_MARKER_abc99";
  const CODE_MARKER = "CODE_LEAK_MARKER_xyz88";

  const response = mapPoints("Казань", {
    points: [
      {
        ...BASE_POINT,
        id: "pt-2",
        code: CODE_MARKER,
        name: "Точка",
        address: "Адрес",
        city: "Казань",
        latitude: 55.8,
        longitude: 49.1,
        kind: "postamat",
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
  assert.equal(response.points[0].kind, "postamat");
  assert.equal(response.points[0].carrierName, "NAME_FOR:yataxi");
});

test("failed carrier passes only providerKey and status", () => {
  const response = mapPoints("Москва", {
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
  const response = mapPoints("Москва", {
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
  const response = mapPoints("Пустоград", {
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

test("Yandex and CDEK points resolve to different seller-facing carrierNames", () => {
  const response = toPickupPointsResponse(
    "Москва",
    {
      points: [
        { ...BASE_POINT, id: "y1", providerKey: "yataxi" },
        {
          ...BASE_POINT,
          id: "c1",
          providerKey: "cdek",
          code: "MSK65",
          name: "CDEK office",
        },
      ],
      carriers: [
        { providerKey: "yataxi", status: "ok" },
        { providerKey: "cdek", status: "ok" },
      ],
    },
    (providerKey) => providerSellerDisplayName(providerKey) ?? "",
  );

  assert.equal(response.points[0].carrierName, "Перевозчик №1");
  assert.equal(response.points[1].carrierName, "Перевозчик №2");
  assert.notEqual(
    response.points[0].carrierName,
    response.points[1].carrierName,
  );
  assert.equal(response.points[0].providerKey, "yataxi");
  assert.equal(response.points[1].providerKey, "cdek");
  assert.ok("carrierName" in response.points[0]);
  assert.ok("carrierName" in response.points[1]);
});
