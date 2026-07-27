import assert from "node:assert/strict";
import test from "node:test";

import { convertNeutralItemToExpressMeasures } from "../packages/core/src/carrier-adapter/yandex/express-client.ts";

test("convertNeutralItemToExpressMeasures converts cm and grams to metres and kilograms", () => {
  assert.deepEqual(
    convertNeutralItemToExpressMeasures({
      lengthCm: 30,
      widthCm: 20,
      heightCm: 10,
      weightG: 1000,
    }),
    { length: 0.3, width: 0.2, height: 0.1, weight: 1 },
  );
});

test("convertNeutralItemToExpressMeasures throws when a dimension is missing", () => {
  assert.throws(
    () => convertNeutralItemToExpressMeasures({ weightG: 500 }),
    /Yandex Express item missing lengthCm/,
  );
  assert.throws(
    () =>
      convertNeutralItemToExpressMeasures({
        lengthCm: 30,
        heightCm: 10,
        weightG: 500,
      }),
    /Yandex Express item missing widthCm/,
  );
  assert.throws(
    () =>
      convertNeutralItemToExpressMeasures({
        lengthCm: 30,
        widthCm: 20,
        weightG: 500,
      }),
    /Yandex Express item missing heightCm/,
  );
});
