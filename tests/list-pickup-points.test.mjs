import assert from "node:assert/strict";
import test from "node:test";

import { listPickupPointsForCompany } from "../apps/web/lib/shipments/list-pickup-points.ts";

/** @typedef {import("@oco/core/carrier-adapter/types").CarrierPickupPoint} CarrierPickupPoint */
/** @typedef {import("@oco/core/carrier-adapter/pickup-point-adapters").PickupPointAdapter} PickupPointAdapter */
/** @typedef {import("../apps/web/lib/shipments/list-connected-carriers.ts").ConnectedCarrier} ConnectedCarrier */

/**
 * @param {string} providerKey
 * @param {Partial<CarrierPickupPoint>[]} pointOverrides
 * @returns {CarrierPickupPoint[]}
 */
function makePoints(providerKey, pointOverrides) {
  return pointOverrides.map((partial, i) => ({
    id: partial.id ?? `${providerKey}-pt-${i}`,
    providerKey,
    code: partial.code ?? `code-${i}`,
    name: partial.name ?? `Point ${i}`,
    address: partial.address ?? `Address ${i}`,
    city: partial.city ?? "City",
    latitude: partial.latitude ?? 55.75,
    longitude: partial.longitude ?? 37.62,
  }));
}

/**
 * @param {string} providerKey
 * @param {(input: { city: string }, credentials: Record<string, string>) => Promise<import("@oco/core/carrier-adapter/types").CarrierListPointsResult>} listPickupPoints
 * @returns {PickupPointAdapter}
 */
function fakeAdapter(providerKey, listPickupPoints) {
  return { providerKey, listPickupPoints };
}

test("two carriers both ok → points concatenated in carrier order, both resolvedLocation present", async () => {
  const aPoints = makePoints("alpha", [{ id: "a1" }, { id: "a2" }]);
  const bPoints = makePoints("beta", [{ id: "b1" }]);

  const result = await listPickupPointsForCompany(
    { city: "Москва" },
    {
      listConnected: async () => [
        { providerKey: "alpha", credentials: { token: "a" } },
        { providerKey: "beta", credentials: { token: "b" } },
      ],
      getAdapter: (key) => {
        if (key === "alpha") {
          return fakeAdapter("alpha", async () => ({
            ok: true,
            resolvedLocation: { id: "geo-a", address: "Alpha City" },
            points: aPoints,
          }));
        }
        if (key === "beta") {
          return fakeAdapter("beta", async () => ({
            ok: true,
            resolvedLocation: { id: "geo-b", address: "Beta City" },
            points: bPoints,
          }));
        }
        return undefined;
      },
    },
  );

  assert.deepEqual(
    result.points.map((p) => p.id),
    ["a1", "a2", "b1"],
  );
  assert.deepEqual(result.carriers, [
    {
      providerKey: "alpha",
      status: "ok",
      resolvedLocation: { id: "geo-a", address: "Alpha City" },
    },
    {
      providerKey: "beta",
      status: "ok",
      resolvedLocation: { id: "geo-b", address: "Beta City" },
    },
  ]);
});

test("same city string resolves differently per carrier — both kept, not reconciled", async () => {
  const result = await listPickupPointsForCompany(
    { city: "Пушкино" },
    {
      listConnected: async () => [
        { providerKey: "alpha", credentials: { token: "a" } },
        { providerKey: "beta", credentials: { token: "b" } },
      ],
      getAdapter: (key) => {
        if (key === "alpha") {
          return fakeAdapter("alpha", async () => ({
            ok: true,
            resolvedLocation: {
              id: "geo-pushkino-moscow",
              address: "Пушкино, Московская область",
            },
            points: makePoints("alpha", [{ id: "a-msk" }]),
          }));
        }
        if (key === "beta") {
          return fakeAdapter("beta", async () => ({
            ok: true,
            resolvedLocation: {
              id: "geo-pushkino-spb",
              address: "Пушкино, Ленинградская область",
            },
            points: makePoints("beta", [{ id: "b-spb" }]),
          }));
        }
        return undefined;
      },
    },
  );

  assert.equal(result.carriers.length, 2);
  assert.deepEqual(result.carriers[0].resolvedLocation, {
    id: "geo-pushkino-moscow",
    address: "Пушкино, Московская область",
  });
  assert.deepEqual(result.carriers[1].resolvedLocation, {
    id: "geo-pushkino-spb",
    address: "Пушкино, Ленинградская область",
  });
  assert.deepEqual(
    result.points.map((p) => p.id),
    ["a-msk", "b-spb"],
  );
});

test("one ok, one city_not_resolved → partial points, both carriers reported", async () => {
  const result = await listPickupPointsForCompany(
    { city: "Nowhere" },
    {
      listConnected: async () => [
        { providerKey: "alpha", credentials: { token: "a" } },
        { providerKey: "beta", credentials: { token: "b" } },
      ],
      getAdapter: (key) => {
        if (key === "alpha") {
          return fakeAdapter("alpha", async () => ({
            ok: true,
            resolvedLocation: { id: "geo-a", address: "Alpha" },
            points: makePoints("alpha", [{ id: "a1" }]),
          }));
        }
        if (key === "beta") {
          return fakeAdapter("beta", async () => ({
            ok: false,
            reason: "city_not_resolved",
          }));
        }
        return undefined;
      },
    },
  );

  assert.deepEqual(
    result.points.map((p) => p.id),
    ["a1"],
  );
  assert.deepEqual(result.carriers, [
    {
      providerKey: "alpha",
      status: "ok",
      resolvedLocation: { id: "geo-a", address: "Alpha" },
    },
    { providerKey: "beta", status: "city_not_resolved" },
  ]);
});

test("one ok, one throws → ok points kept, thrower failed, service does not throw; provider message absent from return", async () => {
  const SECRET = "PROVIDER_SECRET_FAULT_MESSAGE_xyz_77";

  const result = await listPickupPointsForCompany(
    { city: "Москва" },
    {
      listConnected: async () => [
        { providerKey: "alpha", credentials: { token: "a" } },
        { providerKey: "beta", credentials: { token: "b" } },
      ],
      getAdapter: (key) => {
        if (key === "alpha") {
          return fakeAdapter("alpha", async () => ({
            ok: true,
            resolvedLocation: { id: "geo-a", address: "Alpha" },
            points: makePoints("alpha", [{ id: "a1" }]),
          }));
        }
        if (key === "beta") {
          return fakeAdapter("beta", async () => {
            throw new Error(SECRET);
          });
        }
        return undefined;
      },
    },
  );

  assert.deepEqual(
    result.points.map((p) => p.id),
    ["a1"],
  );
  assert.deepEqual(result.carriers, [
    {
      providerKey: "alpha",
      status: "ok",
      resolvedLocation: { id: "geo-a", address: "Alpha" },
    },
    { providerKey: "beta", status: "failed" },
  ]);

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(SECRET), false);
});

test("connected carrier with no registered adapter → no_adapter, still listed", async () => {
  const result = await listPickupPointsForCompany(
    { city: "Москва" },
    {
      listConnected: async () => [
        { providerKey: "orphan", credentials: { token: "x" } },
        { providerKey: "alpha", credentials: { token: "a" } },
      ],
      getAdapter: (key) => {
        if (key === "alpha") {
          return fakeAdapter("alpha", async () => ({
            ok: true,
            resolvedLocation: { id: "geo-a", address: "Alpha" },
            points: makePoints("alpha", [{ id: "a1" }]),
          }));
        }
        return undefined;
      },
    },
  );

  assert.deepEqual(result.carriers, [
    { providerKey: "orphan", status: "no_adapter" },
    {
      providerKey: "alpha",
      status: "ok",
      resolvedLocation: { id: "geo-a", address: "Alpha" },
    },
  ]);
  assert.deepEqual(
    result.points.map((p) => p.id),
    ["a1"],
  );
});

test("no connected carriers → empty points and carriers", async () => {
  const result = await listPickupPointsForCompany(
    { city: "Москва" },
    {
      listConnected: async () => [],
      getAdapter: () => undefined,
    },
  );
  assert.deepEqual(result, { points: [], carriers: [] });
});
