import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ORDER_ADAPTER_KEY,
  ORDER_ADAPTER_SELLER_TITLES,
  orderAdapterSellerTitle,
} from "../packages/core/src/carrier-adapter/order-adapter-seller-titles.ts";
import {
  ORDER_ADAPTER_LABEL_SUPPORT,
  orderAdapterSupportsLabel,
} from "../packages/core/src/carrier-adapter/order-adapter-label-support.ts";
import { providerSellerDisplayName } from "../packages/core/src/carrier-adapter/provider-seller-display-names.ts";
import { claimStatusTextRu } from "../packages/core/src/carrier-adapter/yandex/map-claim-status.ts";
import { formatReturnReason } from "../apps/web/lib/shipments/labels.ts";
import { PROTOTYPE_KEYS } from "./helpers/prototype-keys.mjs";

/**
 * ONE DEFECT, FIVE SITES — which is why these live together instead of in each
 * module's own file. Each of the five resolves a string that came from outside
 * by indexing an object literal, and a plain `obj[key]` walks the prototype
 * chain: "constructor" and friends resolve to a truthy Object.prototype member,
 * so neither `=== undefined` nor `?? fallback` ever fires and the member is
 * returned in place of a title, a flag, a name or a label.
 *
 * The keys come from the shared list so a sixth site copying any of these gets
 * the same coverage — tests/helpers/prototype-keys.mjs.
 */

/** Actual value in the message: a defect you can read beats one you infer. */
const shown = (value) => `${typeof value}: ${String(value)}`;

test("orderAdapterSellerTitle: a prototype name gets the default title, not a member", () => {
  const expected = ORDER_ADAPTER_SELLER_TITLES[DEFAULT_ORDER_ADAPTER_KEY];
  for (const key of PROTOTYPE_KEYS) {
    const actual = orderAdapterSellerTitle(key);
    assert.equal(
      typeof actual,
      "string",
      `orderAdapterSellerTitle(${JSON.stringify(key)}) returned ${shown(actual)}`,
    );
    assert.equal(
      actual,
      expected,
      `orderAdapterSellerTitle(${JSON.stringify(key)}) returned ${shown(actual)}`,
    );
  }
});

test("orderAdapterSupportsLabel: a prototype name gets the default flag, not a member", () => {
  const expected = ORDER_ADAPTER_LABEL_SUPPORT[DEFAULT_ORDER_ADAPTER_KEY];
  for (const key of PROTOTYPE_KEYS) {
    const actual = orderAdapterSupportsLabel(key);
    assert.equal(
      typeof actual,
      "boolean",
      `orderAdapterSupportsLabel(${JSON.stringify(key)}) returned ${shown(actual)}`,
    );
    assert.equal(
      actual,
      expected,
      `orderAdapterSupportsLabel(${JSON.stringify(key)}) returned ${shown(actual)}`,
    );
  }
});

test("providerSellerDisplayName: a prototype name resolves to no carrier at all", () => {
  for (const key of PROTOTYPE_KEYS) {
    const actual = providerSellerDisplayName(key);
    assert.equal(
      actual,
      undefined,
      `providerSellerDisplayName(${JSON.stringify(key)}) returned ${shown(actual)}`,
    );
  }
});

test("claimStatusTextRu: a prototype name is not a status label", () => {
  for (const key of PROTOTYPE_KEYS) {
    const actual = claimStatusTextRu(key);
    assert.equal(
      actual,
      null,
      `claimStatusTextRu(${JSON.stringify(key)}) returned ${shown(actual)}`,
    );
  }
});

test("formatReturnReason: a prototype name comes back as itself, not a member", () => {
  for (const key of PROTOTYPE_KEYS) {
    const actual = formatReturnReason(key);
    assert.equal(
      typeof actual,
      "string",
      `formatReturnReason(${JSON.stringify(key)}) returned ${shown(actual)}`,
    );
    assert.equal(
      actual,
      key,
      `formatReturnReason(${JSON.stringify(key)}) returned ${shown(actual)}`,
    );
  }
});
