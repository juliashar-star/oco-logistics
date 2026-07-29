import assert from "node:assert/strict";
import test from "node:test";

import { CarrierLabelsNotReadyError } from "../packages/core/src/carrier-adapter/errors.ts";
import { resolveOrderAdapter } from "../packages/core/src/carrier-adapter/order-adapters.ts";
import { YandexAuthError } from "../packages/core/src/carrier-adapter/yandex/transport.ts";
import { getShipmentLabel } from "../apps/web/lib/shipments/get-shipment-label.ts";

const COMPANY = "company-1";
const SHIPMENT_ID = "ship-1";
const PROVIDER_ORDER_ID = "req-abc";
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

/**
 * @param {Partial<import("../apps/web/lib/shipments/get-shipment-label.ts").ShipmentLabelRow>} overrides
 */
function row(overrides = {}) {
  return {
    id: SHIPMENT_ID,
    status: "CREATED",
    providerOrderId: PROVIDER_ORDER_ID,
    orderAdapterKey: "yataxi:next_day",
    ...overrides,
  };
}

/**
 * @param {object} opts
 * @param {() => Promise<import("../apps/web/lib/shipments/get-shipment-label.ts").ShipmentLabelRow | null>} [opts.load]
 * @param {() => Promise<{ ok: true; credentials: Record<string, string> } | { ok: false; reason: "not_connected" }>} [opts.creds]
 * @param {(key: string | null | undefined) => import("../packages/core/src/carrier-adapter/order-adapters.ts").OrderAdapter} [opts.resolve]
 * @param {() => Promise<{ bytes: Uint8Array; contentType: string }>} [opts.generateLabels]
 */
function deps(opts = {}) {
  let carrierCalls = 0;
  const generateLabels =
    opts.generateLabels ??
    (async () => {
      carrierCalls += 1;
      return { bytes: PDF_BYTES, contentType: "application/pdf" };
    });

  return {
    carrierCalls: () => carrierCalls,
    deps: {
      loadShipment:
        opts.load ??
        (async () => row()),
      getCredentials:
        opts.creds ??
        (async () => ({ ok: true, credentials: { token: "t", platformStationId: "s" } })),
      resolveAdapter:
        opts.resolve ??
        ((key) => {
          const base = resolveOrderAdapter(key);
          if (typeof base.generateLabels === "function") {
            return { ...base, generateLabels };
          }
          return base;
        }),
    },
  };
}

test("Express shipment is NEVER served a label (adapter without generateLabels)", async () => {
  let carrierCalls = 0;
  const result = await getShipmentLabel(
    { shipmentId: SHIPMENT_ID, companyId: COMPANY },
    {
      loadShipment: async () =>
        row({ orderAdapterKey: "yataxi:express" }),
      getCredentials: async () => {
        carrierCalls += 1;
        return { ok: true, credentials: { token: "t" } };
      },
      resolveAdapter: resolveOrderAdapter,
    },
  );

  assert.deepEqual(result, { ok: false, reason: "unsupported_service" });
  assert.equal(carrierCalls, 0);
  assert.equal(
    typeof resolveOrderAdapter("yataxi:express").generateLabels,
    "undefined",
  );
});

test("CANCELED shipment is refused even though the carrier would serve one", async () => {
  const { deps: d, carrierCalls } = deps({
    load: async () =>
      row({ status: "CANCELED", providerOrderId: PROVIDER_ORDER_ID }),
  });

  const result = await getShipmentLabel(
    { shipmentId: SHIPMENT_ID, companyId: COMPANY },
    d,
  );

  assert.deepEqual(result, { ok: false, reason: "not_allowed_for_status" });
  assert.equal(carrierCalls(), 0);
});

test("null providerOrderId is refused WITHOUT the carrier being called", async () => {
  const { deps: d, carrierCalls } = deps({
    load: async () => row({ providerOrderId: null }),
  });

  const result = await getShipmentLabel(
    { shipmentId: SHIPMENT_ID, companyId: COMPANY },
    d,
  );

  assert.deepEqual(result, { ok: false, reason: "no_carrier_order" });
  assert.equal(carrierCalls(), 0);
});

test("null orderAdapterKey resolves to next_day and IS labellable", async () => {
  const { deps: d, carrierCalls } = deps({
    load: async () => row({ orderAdapterKey: null }),
  });

  const result = await getShipmentLabel(
    { shipmentId: SHIPMENT_ID, companyId: COMPANY },
    d,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.document.contentType, "application/pdf");
    assert.deepEqual(Array.from(result.document.bytes), Array.from(PDF_BYTES));
  }
  assert.equal(carrierCalls(), 1);
  assert.equal(resolveOrderAdapter(null).key, "yataxi:next_day");
});

test("CarrierLabelsNotReadyError becomes not_ready; provider raw text nowhere in result", async () => {
  const providerText =
    "Попробуйте позже: labels are not ready yet (provider raw)";
  const { deps: d } = deps({
    generateLabels: async () => {
      throw new CarrierLabelsNotReadyError(
        `Yandex Delivery generate labels failed: HTTP 409 ${providerText}`,
      );
    },
  });

  const result = await getShipmentLabel(
    { shipmentId: SHIPMENT_ID, companyId: COMPANY },
    d,
  );

  assert.deepEqual(result, { ok: false, reason: "not_ready" });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(providerText), false);
  assert.equal(serialized.includes("Попробуйте позже"), false);
  assert.equal(serialized.includes("not ready"), false);
});

test("status outside the allow-list is refused", async () => {
  for (const status of ["DRAFT", "SUBMITTING", "DELIVERED", "RETURNED", "PROBLEM"]) {
    const { deps: d, carrierCalls } = deps({
      load: async () => row({ status }),
    });
    const result = await getShipmentLabel(
      { shipmentId: SHIPMENT_ID, companyId: COMPANY },
      d,
    );
    assert.deepEqual(
      result,
      { ok: false, reason: "not_allowed_for_status" },
      `expected refuse for status ${status}`,
    );
    assert.equal(carrierCalls(), 0, `carrier must not be called for ${status}`);
  }
});

test("loader miss → not_found", async () => {
  const result = await getShipmentLabel(
    { shipmentId: SHIPMENT_ID, companyId: COMPANY },
    {
      loadShipment: async () => null,
      getCredentials: async () => {
        throw new Error("should not load credentials");
      },
      resolveAdapter: resolveOrderAdapter,
    },
  );
  assert.deepEqual(result, { ok: false, reason: "not_found" });
});

test("missing credentials → carrier_not_connected", async () => {
  const result = await getShipmentLabel(
    { shipmentId: SHIPMENT_ID, companyId: COMPANY },
    {
      loadShipment: async () => row(),
      getCredentials: async () => ({ ok: false, reason: "not_connected" }),
      resolveAdapter: resolveOrderAdapter,
    },
  );
  assert.deepEqual(result, { ok: false, reason: "carrier_not_connected" });
});

test("YandexAuthError (real 401 class) → carrier_auth via CarrierAuthError inheritance", async () => {
  const { deps: d } = deps({
    generateLabels: async () => {
      throw new YandexAuthError("raw auth body must not leak");
    },
  });
  const result = await getShipmentLabel(
    { shipmentId: SHIPMENT_ID, companyId: COMPANY },
    d,
  );
  assert.deepEqual(result, { ok: false, reason: "carrier_auth" });
  assert.equal(JSON.stringify(result).includes("raw auth"), false);
});

test("loadShipment is called with both shipmentId and companyId", async () => {
  /** @type {[string, string] | null} */
  let seen = null;
  await getShipmentLabel(
    { shipmentId: SHIPMENT_ID, companyId: COMPANY },
    {
      loadShipment: async (id, companyId) => {
        seen = [id, companyId];
        return null;
      },
      getCredentials: async () => ({ ok: false, reason: "not_connected" }),
      resolveAdapter: resolveOrderAdapter,
    },
  );
  assert.deepEqual(seen, [SHIPMENT_ID, COMPANY]);
});
