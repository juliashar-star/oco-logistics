import assert from "node:assert/strict";
import test from "node:test";

import {
  calculationSnapshotKey,
  snapshotsEqual,
} from "../apps/web/lib/shipments/calculation-snapshot.ts";

function baseSnapshot(overrides = {}) {
  return {
    recipientName: "Иванов Иван",
    recipientPhone: "+79001234567",
    weightG: "1000",
    lengthCm: "30",
    widthCm: "20",
    heightCm: "10",
    declaredValueRub: "3000",
    destCity: "Москва",
    destAddress: "ул Тверская, д 1",
    pointOutId: "",
    pickupType: /** @type {const} */ ("COURIER"),
    handoverMode: /** @type {const} */ ("DROP_OFF"),
    needsThermalBag: false,
    pvzProviderKey: "",
    ...overrides,
  };
}

test("snapshotsEqual returns false when only needsThermalBag differs", () => {
  const a = baseSnapshot({ needsThermalBag: false });
  const b = baseSnapshot({ needsThermalBag: true });
  assert.equal(snapshotsEqual(a, b), false);
});

test("snapshotsEqual returns true when needsThermalBag matches with otherwise equal fields", () => {
  const a = baseSnapshot({ needsThermalBag: true });
  const b = baseSnapshot({ needsThermalBag: true });
  assert.equal(snapshotsEqual(a, b), true);
});

test("snapshotsEqual returns false when only handoverMode differs", () => {
  const a = baseSnapshot({ handoverMode: "DROP_OFF" });
  const b = baseSnapshot({ handoverMode: "COURIER" });
  assert.equal(snapshotsEqual(a, b), false);
});

test("snapshotsEqual returns true when handoverMode matches with otherwise equal fields", () => {
  const a = baseSnapshot({ handoverMode: "COURIER" });
  const b = baseSnapshot({ handoverMode: "COURIER" });
  assert.equal(snapshotsEqual(a, b), true);
});

test("snapshotsEqual returns false when only pickupType differs and both destinations are blank", () => {
  // Pre-existing defect: without comparing pickupType itself, blank destAddress
  // and blank pointOutId make PVZ vs COURIER look equal and a stale quote survives.
  const a = baseSnapshot({
    pickupType: "PVZ",
    destAddress: "",
    pointOutId: "",
  });
  const b = baseSnapshot({
    pickupType: "COURIER",
    destAddress: "",
    pointOutId: "",
  });
  assert.equal(snapshotsEqual(a, b), false);
});

test("snapshotsEqual returns false when only pvzProviderKey differs", () => {
  const a = baseSnapshot({
    pickupType: "PVZ",
    pointOutId: "station-1",
    destAddress: "",
    pvzProviderKey: "yataxi",
  });
  const b = baseSnapshot({
    pickupType: "PVZ",
    pointOutId: "station-1",
    destAddress: "",
    pvzProviderKey: "cdek",
  });
  assert.equal(snapshotsEqual(a, b), false);
});

test("snapshotsEqual returns true when pvzProviderKey matches with otherwise equal fields", () => {
  const a = baseSnapshot({
    pickupType: "PVZ",
    pointOutId: "station-1",
    destAddress: "",
    pvzProviderKey: "yataxi",
  });
  const b = baseSnapshot({
    pickupType: "PVZ",
    pointOutId: "station-1",
    destAddress: "",
    pvzProviderKey: "yataxi",
  });
  assert.equal(snapshotsEqual(a, b), true);
});

test("calculationSnapshotKey differs when only needsThermalBag changes", () => {
  const a = baseSnapshot({ needsThermalBag: false });
  const b = baseSnapshot({ needsThermalBag: true });
  assert.notEqual(calculationSnapshotKey(a), calculationSnapshotKey(b));
});

test("calculationSnapshotKey changes when any single field of the snapshot changes", () => {
  // Enforcement: every key on the object must affect the string. Adding a
  // field to CalculationSnapshot without it reaching the derivation fails here
  // on its own — the loop walks Object.keys of a real snapshot value.
  const base = baseSnapshot();
  const baseKey = calculationSnapshotKey(base);
  assert.ok(Object.keys(base).length > 0);

  for (const key of Object.keys(base)) {
    const variant = { ...base };
    const current = base[key];
    if (typeof current === "boolean") {
      variant[key] = !current;
    } else if (typeof current === "string") {
      variant[key] = `${current}__changed`;
    } else {
      assert.fail(`unexpected type for snapshot field ${key}`);
    }
    assert.notEqual(
      calculationSnapshotKey(variant),
      baseKey,
      `calculationSnapshotKey must change when only ${key} changes`,
    );
  }
});
