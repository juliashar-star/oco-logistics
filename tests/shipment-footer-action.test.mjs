import assert from "node:assert/strict";
import test from "node:test";

import { shipmentFooterAction } from "../apps/web/lib/shipments/shipment-footer-action.ts";

test('shipmentFooterAction: DRAFT, not anonymised → "delete"', () => {
  assert.equal(
    shipmentFooterAction({ status: "DRAFT", isAnonymized: false }),
    "delete",
  );
});

test('shipmentFooterAction: DRAFT, already anonymised → "delete"', () => {
  assert.equal(
    shipmentFooterAction({ status: "DRAFT", isAnonymized: true }),
    "delete",
  );
});

test('shipmentFooterAction: not DRAFT, not anonymised → "anonymize"', () => {
  assert.equal(
    shipmentFooterAction({ status: "CREATED", isAnonymized: false }),
    "anonymize",
  );
});

test('shipmentFooterAction: not DRAFT, anonymised → "none"', () => {
  assert.equal(
    shipmentFooterAction({ status: "CREATED", isAnonymized: true }),
    "none",
  );
});
