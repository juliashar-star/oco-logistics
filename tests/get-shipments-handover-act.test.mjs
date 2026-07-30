import assert from "node:assert/strict";
import test from "node:test";

import { resolveOrderAdapter } from "../packages/core/src/carrier-adapter/order-adapters.ts";
import { YandexAuthError } from "../packages/core/src/carrier-adapter/yandex/transport.ts";
import {
  HANDOVER_ACT_SELECTION_LIMIT,
  getShipmentsHandoverAct,
} from "../apps/web/lib/shipments/get-shipments-handover-act.ts";

const COMPANY = "company-1";
const SHIPMENT_A = "ship-a";
const SHIPMENT_B = "ship-b";
const PROVIDER_ORDER_A = "req-aaa";
const PROVIDER_ORDER_B = "req-bbb";
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

/**
 * @param {Partial<import("../apps/web/lib/shipments/get-shipments-handover-act.ts").HandoverActShipmentRow>} overrides
 */
function row(overrides = {}) {
  return {
    id: SHIPMENT_A,
    status: "CREATED",
    providerOrderId: PROVIDER_ORDER_A,
    orderAdapterKey: "yataxi:next_day",
    ...overrides,
  };
}

/**
 * @param {object} opts
 * @param {(ids: string[], companyId: string) => Promise<import("../apps/web/lib/shipments/get-shipments-handover-act.ts").HandoverActShipmentRow[]>} [opts.load]
 * @param {() => Promise<{ ok: true; credentials: Record<string, string> } | { ok: false; reason: "not_connected" }>} [opts.creds]
 * @param {(key: string | null | undefined) => import("../packages/core/src/carrier-adapter/order-adapters.ts").OrderAdapter} [opts.resolve]
 * @param {(ids: string[]) => Promise<{ bytes: Uint8Array; contentType: string }>} [opts.getHandoverAct]
 */
function deps(opts = {}) {
  let carrierCalls = 0;
  /** @type {string[][]} */
  const carrierIdArgs = [];
  const getHandoverAct =
    opts.getHandoverAct ??
    (async (ids) => {
      carrierCalls += 1;
      carrierIdArgs.push(ids);
      return { bytes: PDF_BYTES, contentType: "application/pdf" };
    });

  return {
    carrierCalls: () => carrierCalls,
    carrierIdArgs: () => carrierIdArgs,
    deps: {
      loadShipments:
        opts.load ??
        (async (ids) => ids.map((id) => row({ id, providerOrderId: `po-${id}` }))),
      getCredentials:
        opts.creds ??
        (async () => ({
          ok: true,
          credentials: { token: "t", platformStationId: "s" },
        })),
      resolveAdapter:
        opts.resolve ??
        ((key) => {
          const base = resolveOrderAdapter(key);
          if (typeof base.getHandoverAct === "function") {
            return { ...base, getHandoverAct };
          }
          return base;
        }),
    },
  };
}

test("empty id list is refused before any carrier call", async () => {
  let loadCalls = 0;
  let carrierCalls = 0;
  const result = await getShipmentsHandoverAct(
    { shipmentIds: [], companyId: COMPANY },
    {
      loadShipments: async () => {
        loadCalls += 1;
        return [];
      },
      getCredentials: async () => {
        carrierCalls += 1;
        return { ok: true, credentials: { token: "t" } };
      },
      resolveAdapter: resolveOrderAdapter,
    },
  );

  assert.deepEqual(result, { ok: false, reason: "empty_selection" });
  assert.equal(loadCalls, 0);
  assert.equal(carrierCalls, 0);
});

test("selection over the cap is refused before load or carrier call", async () => {
  let loadCalls = 0;
  let carrierCalls = 0;
  const tooMany = Array.from(
    { length: HANDOVER_ACT_SELECTION_LIMIT + 1 },
    (_, i) => `ship-${i}`,
  );
  const result = await getShipmentsHandoverAct(
    { shipmentIds: tooMany, companyId: COMPANY },
    {
      loadShipments: async () => {
        loadCalls += 1;
        return [];
      },
      getCredentials: async () => {
        carrierCalls += 1;
        return { ok: true, credentials: { token: "t" } };
      },
      resolveAdapter: resolveOrderAdapter,
    },
  );

  assert.deepEqual(result, {
    ok: false,
    reason: "selection_too_large",
    selected: HANDOVER_ACT_SELECTION_LIMIT + 1,
    limit: HANDOVER_ACT_SELECTION_LIMIT,
  });
  assert.equal(loadCalls, 0);
  assert.equal(carrierCalls, 0);
});

test("id belonging to another company is refused; carrier never called", async () => {
  let carrierCalls = 0;
  const result = await getShipmentsHandoverAct(
    { shipmentIds: [SHIPMENT_A], companyId: COMPANY },
    {
      // Loader scoped by companyId returns nothing for a foreign id.
      loadShipments: async () => [],
      getCredentials: async () => {
        carrierCalls += 1;
        return { ok: true, credentials: { token: "t" } };
      },
      resolveAdapter: resolveOrderAdapter,
    },
  );

  assert.deepEqual(result, { ok: false, reason: "not_found" });
  assert.equal(carrierCalls, 0);
});

test("id with no providerOrderId is refused; carrier never called", async () => {
  const { deps: d, carrierCalls } = deps({
    load: async () => [row({ providerOrderId: null })],
  });

  const result = await getShipmentsHandoverAct(
    { shipmentIds: [SHIPMENT_A], companyId: COMPANY },
    d,
  );

  assert.deepEqual(result, { ok: false, reason: "no_carrier_order" });
  assert.equal(carrierCalls(), 0);
});

test("Express shipment resolves to no act capability; carrier never called", async () => {
  let carrierCalls = 0;
  const result = await getShipmentsHandoverAct(
    { shipmentIds: [SHIPMENT_A], companyId: COMPANY },
    {
      loadShipments: async () => [
        row({ orderAdapterKey: "yataxi:express" }),
      ],
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
    typeof resolveOrderAdapter("yataxi:express").getHandoverAct,
    "undefined",
  );
});

test("CANCELED shipment is refused; credentials and carrier never called", async () => {
  let credCalls = 0;
  let carrierCalls = 0;
  const result = await getShipmentsHandoverAct(
    { shipmentIds: [SHIPMENT_A], companyId: COMPANY },
    {
      loadShipments: async () => [row({ status: "CANCELED" })],
      getCredentials: async () => {
        credCalls += 1;
        return { ok: true, credentials: { token: "t", platformStationId: "s" } };
      },
      resolveAdapter: (key) => {
        const base = resolveOrderAdapter(key);
        return {
          ...base,
          getHandoverAct: async (...args) => {
            carrierCalls += 1;
            return base.getHandoverAct(...args);
          },
        };
      },
    },
  );

  assert.deepEqual(result, {
    ok: false,
    reason: "not_allowed_for_status",
    shipmentIds: [SHIPMENT_A],
  });
  assert.equal(credCalls, 0);
  assert.equal(carrierCalls, 0);
});

test("DELIVERED shipment is refused; credentials and carrier never called", async () => {
  let credCalls = 0;
  let carrierCalls = 0;
  const result = await getShipmentsHandoverAct(
    { shipmentIds: [SHIPMENT_A], companyId: COMPANY },
    {
      loadShipments: async () => [row({ status: "DELIVERED" })],
      getCredentials: async () => {
        credCalls += 1;
        return { ok: true, credentials: { token: "t", platformStationId: "s" } };
      },
      resolveAdapter: (key) => {
        const base = resolveOrderAdapter(key);
        return {
          ...base,
          getHandoverAct: async (...args) => {
            carrierCalls += 1;
            return base.getHandoverAct(...args);
          },
        };
      },
    },
  );

  assert.deepEqual(result, {
    ok: false,
    reason: "not_allowed_for_status",
    shipmentIds: [SHIPMENT_A],
  });
  assert.equal(credCalls, 0);
  assert.equal(carrierCalls, 0);
});

test("IN_TRANSIT shipment is allowed", async () => {
  const { deps: d, carrierCalls } = deps({
    load: async () => [row({ status: "IN_TRANSIT" })],
  });

  const result = await getShipmentsHandoverAct(
    { shipmentIds: [SHIPMENT_A], companyId: COMPANY },
    d,
  );

  assert.equal(result.ok, true);
  assert.equal(carrierCalls(), 1);
});

test("mix of CREATED and IN_TRANSIT is allowed", async () => {
  const { deps: d, carrierCalls, carrierIdArgs } = deps({
    load: async () => [
      row({
        id: SHIPMENT_A,
        status: "CREATED",
        providerOrderId: PROVIDER_ORDER_A,
      }),
      row({
        id: SHIPMENT_B,
        status: "IN_TRANSIT",
        providerOrderId: PROVIDER_ORDER_B,
      }),
    ],
  });

  const result = await getShipmentsHandoverAct(
    { shipmentIds: [SHIPMENT_A, SHIPMENT_B], companyId: COMPANY },
    d,
  );

  assert.equal(result.ok, true);
  assert.equal(carrierCalls(), 1);
  assert.deepEqual(carrierIdArgs(), [[PROVIDER_ORDER_A, PROVIDER_ORDER_B]]);
});

test("one bad status among several is refused with that id named", async () => {
  let credCalls = 0;
  let carrierCalls = 0;
  const result = await getShipmentsHandoverAct(
    { shipmentIds: [SHIPMENT_A, SHIPMENT_B], companyId: COMPANY },
    {
      loadShipments: async () => [
        row({
          id: SHIPMENT_A,
          status: "CREATED",
          providerOrderId: PROVIDER_ORDER_A,
        }),
        row({
          id: SHIPMENT_B,
          status: "CANCELED",
          providerOrderId: PROVIDER_ORDER_B,
        }),
      ],
      getCredentials: async () => {
        credCalls += 1;
        return { ok: true, credentials: { token: "t", platformStationId: "s" } };
      },
      resolveAdapter: (key) => {
        const base = resolveOrderAdapter(key);
        return {
          ...base,
          getHandoverAct: async (...args) => {
            carrierCalls += 1;
            return base.getHandoverAct(...args);
          },
        };
      },
    },
  );

  assert.deepEqual(result, {
    ok: false,
    reason: "not_allowed_for_status",
    shipmentIds: [SHIPMENT_B],
  });
  assert.equal(credCalls, 0);
  assert.equal(carrierCalls, 0);
});

async function assertMixedServicesRefused(order) {
  let loadCalls = 0;
  let credCalls = 0;
  let carrierCalls = 0;
  const rowsById = {
    [SHIPMENT_A]: row({
      id: SHIPMENT_A,
      orderAdapterKey: "yataxi:next_day",
      providerOrderId: PROVIDER_ORDER_A,
    }),
    [SHIPMENT_B]: row({
      id: SHIPMENT_B,
      orderAdapterKey: "yataxi:express",
      providerOrderId: PROVIDER_ORDER_B,
    }),
  };
  const result = await getShipmentsHandoverAct(
    { shipmentIds: order, companyId: COMPANY },
    {
      loadShipments: async (ids) => {
        loadCalls += 1;
        return ids.map((id) => rowsById[id]);
      },
      getCredentials: async () => {
        credCalls += 1;
        return { ok: true, credentials: { token: "t", platformStationId: "s" } };
      },
      resolveAdapter: (key) => {
        const base = resolveOrderAdapter(key);
        if (typeof base.getHandoverAct !== "function") {
          return base;
        }
        return {
          ...base,
          getHandoverAct: async (...args) => {
            carrierCalls += 1;
            return base.getHandoverAct(...args);
          },
        };
      },
    },
  );

  assert.deepEqual(result, { ok: false, reason: "mixed_services" });
  assert.equal(loadCalls, 1);
  assert.equal(credCalls, 0);
  assert.equal(carrierCalls, 0);
}

test("mixed next_day then express → mixed_services; credentials and carrier never called", async () => {
  await assertMixedServicesRefused([SHIPMENT_A, SHIPMENT_B]);
});

test("mixed express then next_day → mixed_services; credentials and carrier never called", async () => {
  await assertMixedServicesRefused([SHIPMENT_B, SHIPMENT_A]);
});

test("request_ids (providerOrderIds) are passed through unchanged", async () => {
  const { deps: d, carrierIdArgs, carrierCalls } = deps({
    load: async () => [
      row({ id: SHIPMENT_A, providerOrderId: PROVIDER_ORDER_A }),
      row({ id: SHIPMENT_B, providerOrderId: PROVIDER_ORDER_B }),
    ],
  });

  const result = await getShipmentsHandoverAct(
    { shipmentIds: [SHIPMENT_A, SHIPMENT_B], companyId: COMPANY },
    d,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(Buffer.from(result.document.bytes), Buffer.from(PDF_BYTES));
  }
  assert.equal(carrierCalls(), 1);
  assert.deepEqual(carrierIdArgs(), [[PROVIDER_ORDER_A, PROVIDER_ORDER_B]]);
});

test("carrier_auth maps auth errors without throwing", async () => {
  const { deps: d } = deps({
    getHandoverAct: async () => {
      throw new YandexAuthError("Yandex Delivery auth failed: HTTP 401");
    },
  });

  const result = await getShipmentsHandoverAct(
    { shipmentIds: [SHIPMENT_A], companyId: COMPANY },
    d,
  );

  assert.deepEqual(result, { ok: false, reason: "carrier_auth" });
});

test("next_day exposes getHandoverAct; express does not", () => {
  assert.equal(
    typeof resolveOrderAdapter("yataxi:next_day").getHandoverAct,
    "function",
  );
  assert.equal(
    typeof resolveOrderAdapter("yataxi:express").getHandoverAct,
    "undefined",
  );
});
