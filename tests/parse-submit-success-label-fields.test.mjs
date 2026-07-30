import assert from "node:assert/strict";
import test from "node:test";

import { parseSubmitSuccessLabelFields } from "../apps/web/lib/shipments/parse-submit-success-label-fields.ts";
import { shipmentLabelCell } from "../apps/web/lib/shipments/shipment-list-labels.ts";

function labelDecision(fields) {
  return shipmentLabelCell({
    id: "ship-1",
    status: fields.status,
    labelUrl: null,
    providerKey: fields.providerKey,
    orderAdapterKey: fields.orderAdapterKey,
  });
}

test("all three present and well-formed", () => {
  const fields = parseSubmitSuccessLabelFields({
    ok: true,
    requestId: "req-1",
    status: "CREATED",
    providerKey: "yataxi",
    orderAdapterKey: "yataxi:next_day",
  });
  assert.deepEqual(fields, {
    status: "CREATED",
    providerKey: "yataxi",
    orderAdapterKey: "yataxi:next_day",
  });
  assert.equal(labelDecision(fields).kind, "download");
});

test("fields absent entirely → degraded; shipmentLabelCell → none", () => {
  const fields = parseSubmitSuccessLabelFields({ ok: true, requestId: "req-1" });
  assert.deepEqual(fields, {
    status: "",
    providerKey: null,
    orderAdapterKey: null,
  });
  assert.equal(labelDecision(fields).kind, "none");
});

test("fields present but wrong type → degraded; shipmentLabelCell → none", () => {
  const fields = parseSubmitSuccessLabelFields({
    status: 200,
    providerKey: { key: "yataxi" },
    orderAdapterKey: ["yataxi:next_day"],
  });
  assert.deepEqual(fields, {
    status: "",
    providerKey: null,
    orderAdapterKey: null,
  });
  assert.equal(labelDecision(fields).kind, "none");
});

test("null body → degraded; shipmentLabelCell → none", () => {
  const fields = parseSubmitSuccessLabelFields(null);
  assert.deepEqual(fields, {
    status: "",
    providerKey: null,
    orderAdapterKey: null,
  });
  assert.equal(labelDecision(fields).kind, "none");
});
