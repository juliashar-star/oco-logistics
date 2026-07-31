import assert from "node:assert/strict";
import test from "node:test";

import {
  POSTAMAT_MAX_SIDE_CM,
  POSTAMAT_MAX_SIDES_SUM_CM,
  POSTAMAT_MAX_WEIGHT_G,
  parcelFitsPickupPointKind,
} from "../packages/core/src/carrier-adapter/parcel-fits-pickup-point-kind.ts";

const smallParcel = {
  weightG: 1000,
  lengthCm: 30,
  widthCm: 20,
  heightCm: 10,
};

test("small parcel fits a postamat", () => {
  assert.equal(parcelFitsPickupPointKind(smallParcel, "postamat"), true);
});

test("25 kg does not fit a postamat", () => {
  assert.equal(
    parcelFitsPickupPointKind({ ...smallParcel, weightG: 25_000 }, "postamat"),
    false,
  );
});

test("50×40×30 box does not fit a postamat (sum 120 > 118)", () => {
  assert.equal(
    parcelFitsPickupPointKind(
      { weightG: 1000, lengthCm: 50, widthCm: 40, heightCm: 30 },
      "postamat",
    ),
    false,
  );
});

test("45 cm side does not fit a postamat (> 40)", () => {
  assert.equal(
    parcelFitsPickupPointKind(
      { weightG: 1000, lengthCm: 45, widthCm: 20, heightCm: 10 },
      "postamat",
    ),
    false,
  );
});

test("exact boundary 20 kg / 40 cm / sum 118 DO fit a postamat", () => {
  assert.equal(POSTAMAT_MAX_WEIGHT_G, 20_000);
  assert.equal(POSTAMAT_MAX_SIDE_CM, 40);
  assert.equal(POSTAMAT_MAX_SIDES_SUM_CM, 118);
  assert.equal(
    parcelFitsPickupPointKind(
      {
        weightG: POSTAMAT_MAX_WEIGHT_G,
        lengthCm: POSTAMAT_MAX_SIDE_CM,
        widthCm: 40,
        heightCm: 38,
      },
      "postamat",
    ),
    true,
  );
});

test("pickup_point kind is unaffected (always fits)", () => {
  assert.equal(
    parcelFitsPickupPointKind(
      { weightG: 25_000, lengthCm: 50, widthCm: 40, heightCm: 30 },
      "pickup_point",
    ),
    true,
  );
});

test("unknown kind is unaffected (always fits)", () => {
  assert.equal(
    parcelFitsPickupPointKind(
      { weightG: 25_000, lengthCm: 50, widthCm: 40, heightCm: 30 },
      "unknown",
    ),
    true,
  );
});
