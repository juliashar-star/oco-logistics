import assert from "node:assert/strict";
import test from "node:test";

import { resolveBaseUrl as resolveCdekBaseUrl } from "../packages/core/src/carrier-adapter/cdek/transport.ts";
import { resolveBaseUrl as resolveYandexBaseUrl } from "../packages/core/src/carrier-adapter/yandex/transport.ts";
import {
  CARRIER_CONTOUR_ENV,
  checkCarrierContourStartup,
  checkContourHost,
} from "../packages/core/src/carrier-adapter/carrier-contour.ts";

/**
 * Run `fn` with process.env[name] set to `value` (or deleted when null),
 * restoring the previous value afterwards. Serial suite — no cross-test bleed.
 */
function withEnv(name, value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, name);
  const saved = process.env[name];
  if (value === null) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
  try {
    return fn();
  } finally {
    if (had) {
      process.env[name] = saved;
    } else {
      delete process.env[name];
    }
  }
}

// ── Point 1: PIN today's base-URL resolution. Both copies, unchanged by this
// slice. Returns the env value when set (trailing slash stripped); throws
// naming the variable when unset. These must pass against unchanged code.

for (const [family, resolve, envName] of [
  ["cdek", resolveCdekBaseUrl, "CDEK_BASE_URL__PIN"],
  ["yandex", resolveYandexBaseUrl, "YANDEX_DELIVERY_BASE_URL__PIN"],
]) {
  test(`resolveBaseUrl (${family}): returns the env value when set`, () => {
    withEnv(envName, "https://api.edu.cdek.ru", () => {
      assert.equal(resolve(envName), "https://api.edu.cdek.ru");
    });
  });

  test(`resolveBaseUrl (${family}): strips a single trailing slash`, () => {
    withEnv(envName, "https://api.edu.cdek.ru/", () => {
      assert.equal(resolve(envName), "https://api.edu.cdek.ru");
    });
  });

  test(`resolveBaseUrl (${family}): throws naming the variable when unset`, () => {
    withEnv(envName, null, () => {
      assert.throws(() => resolve(envName), new RegExp(`${envName} is not configured`));
    });
  });
}

// ── Points 4 & 7: the pure guard checkContourHost(contour, url).
// Sandbox hosts, one per each of the three covered variables (point 5).

const SANDBOX_URLS = {
  CDEK_BASE_URL: "https://api.edu.cdek.ru",
  YANDEX_DELIVERY_BASE_URL: "https://b2b.taxi.tst.yandex.net",
  YANDEX_EXPRESS_BASE_URL: "https://b2b.taxi.tst.yandex.net",
};
// Real production hosts (from .env.example comments) — not enumerated by the
// guard, so they exercise the "everything else is production" path.
const PRODUCTION_URLS = {
  CDEK_BASE_URL: "https://api.cdek.ru",
  YANDEX_DELIVERY_BASE_URL: "https://b2b-authproxy.taxi.yandex.net",
  YANDEX_EXPRESS_BASE_URL: "https://b2b.taxi.yandex.net",
};

test("checkContourHost: ALLOW — sandbox contour + sandbox host, all three vars", () => {
  for (const url of Object.values(SANDBOX_URLS)) {
    assert.deepEqual(checkContourHost("sandbox", url), { ok: true }, url);
  }
});

test("checkContourHost: ALLOW — production contour + production host, all three vars", () => {
  for (const url of Object.values(PRODUCTION_URLS)) {
    assert.deepEqual(checkContourHost("production", url), { ok: true }, url);
  }
});

test("checkContourHost: REFUSE — sandbox contour but production host (all three vars)", () => {
  for (const [envName, url] of Object.entries(PRODUCTION_URLS)) {
    const result = checkContourHost("sandbox", url);
    assert.equal(result.ok, false, envName);
    assert.match(result.reason, /sandbox/);
    assert.match(result.reason, new RegExp(new URL(url).hostname));
  }
});

test("checkContourHost: REFUSE — production contour but sandbox host (all three vars)", () => {
  for (const [envName, url] of Object.entries(SANDBOX_URLS)) {
    const result = checkContourHost("production", url);
    assert.equal(result.ok, false, envName);
    assert.match(result.reason, /production/);
    assert.match(result.reason, new RegExp(new URL(url).hostname));
  }
});

test("checkContourHost: REFUSE — unknown contour value, naming the variable and both values", () => {
  const result = checkContourHost("staging", SANDBOX_URLS.CDEK_BASE_URL);
  assert.equal(result.ok, false);
  assert.match(result.reason, new RegExp(CARRIER_CONTOUR_ENV));
  assert.match(result.reason, /sandbox/);
  assert.match(result.reason, /production/);
  assert.match(result.reason, /"staging"/);
});

test("checkContourHost: REFUSE — missing contour variable (undefined) reported as unset", () => {
  const result = checkContourHost(undefined, SANDBOX_URLS.CDEK_BASE_URL);
  assert.equal(result.ok, false);
  assert.match(result.reason, new RegExp(CARRIER_CONTOUR_ENV));
  assert.match(result.reason, /unset/);
});

test("checkContourHost: REFUSE — empty-string contour reported as unset", () => {
  const result = checkContourHost("", SANDBOX_URLS.CDEK_BASE_URL);
  assert.equal(result.ok, false);
  assert.match(result.reason, /unset/);
});

// ── Points 1-4 of the follow-up: the whole-deployment decision, moved out of
// the instrumentation hook into checkCarrierContourStartup. Behaviour tests —
// each mismatch names its own variable, and reaching a later variable requires
// the earlier ones to be valid, so a variable silently dropped from the list
// makes its own test fail rather than passing unnoticed.

test("checkCarrierContourStartup: mismatched CDEK_BASE_URL refuses, naming CDEK_BASE_URL", () => {
  const result = checkCarrierContourStartup("sandbox", {
    CDEK_BASE_URL: PRODUCTION_URLS.CDEK_BASE_URL,
    YANDEX_DELIVERY_BASE_URL: SANDBOX_URLS.YANDEX_DELIVERY_BASE_URL,
    YANDEX_EXPRESS_BASE_URL: SANDBOX_URLS.YANDEX_EXPRESS_BASE_URL,
  });
  assert.equal(result.ok, false);
  assert.equal(result.envName, "CDEK_BASE_URL");
  // Byte-identical to the message the hook threw before this refactor (point 4).
  assert.equal(
    result.message,
    'Refusing to start: CDEK_BASE_URL — contour "sandbox" but host api.cdek.ru is not a known carrier sandbox.',
  );
});

test("checkCarrierContourStartup: mismatched YANDEX_DELIVERY_BASE_URL refuses (CDEK valid, so it is reached)", () => {
  const result = checkCarrierContourStartup("sandbox", {
    CDEK_BASE_URL: SANDBOX_URLS.CDEK_BASE_URL,
    YANDEX_DELIVERY_BASE_URL: PRODUCTION_URLS.YANDEX_DELIVERY_BASE_URL,
    YANDEX_EXPRESS_BASE_URL: SANDBOX_URLS.YANDEX_EXPRESS_BASE_URL,
  });
  assert.equal(result.ok, false);
  assert.equal(result.envName, "YANDEX_DELIVERY_BASE_URL");
  assert.match(result.message, /YANDEX_DELIVERY_BASE_URL/);
});

test("checkCarrierContourStartup: mismatched YANDEX_EXPRESS_BASE_URL refuses (both others valid, so it is reached)", () => {
  const result = checkCarrierContourStartup("sandbox", {
    CDEK_BASE_URL: SANDBOX_URLS.CDEK_BASE_URL,
    YANDEX_DELIVERY_BASE_URL: SANDBOX_URLS.YANDEX_DELIVERY_BASE_URL,
    YANDEX_EXPRESS_BASE_URL: PRODUCTION_URLS.YANDEX_EXPRESS_BASE_URL,
  });
  assert.equal(result.ok, false);
  assert.equal(result.envName, "YANDEX_EXPRESS_BASE_URL");
  assert.match(result.message, /YANDEX_EXPRESS_BASE_URL/);
});

test("checkCarrierContourStartup: all three valid under sandbox → ok", () => {
  assert.deepEqual(
    checkCarrierContourStartup("sandbox", {
      CDEK_BASE_URL: SANDBOX_URLS.CDEK_BASE_URL,
      YANDEX_DELIVERY_BASE_URL: SANDBOX_URLS.YANDEX_DELIVERY_BASE_URL,
      YANDEX_EXPRESS_BASE_URL: SANDBOX_URLS.YANDEX_EXPRESS_BASE_URL,
    }),
    { ok: true },
  );
});

test("checkCarrierContourStartup: unset/blank variables are skipped, not refused", () => {
  // None set → ok; a blank string is treated the same as unset (trimmed away).
  assert.deepEqual(checkCarrierContourStartup("production", {}), { ok: true });
  assert.deepEqual(
    checkCarrierContourStartup("production", {
      CDEK_BASE_URL: undefined,
      YANDEX_DELIVERY_BASE_URL: "",
      YANDEX_EXPRESS_BASE_URL: "   ",
    }),
    { ok: true },
  );
});

test("checkCarrierContourStartup: invalid contour refuses before any host is examined", () => {
  // A sandbox host is supplied that WOULD pass under a valid sandbox contour;
  // the refusal is the contour one, proving contour is judged first.
  const result = checkCarrierContourStartup("staging", {
    CDEK_BASE_URL: SANDBOX_URLS.CDEK_BASE_URL,
  });
  assert.equal(result.ok, false);
  assert.equal(result.envName, CARRIER_CONTOUR_ENV);
  assert.equal(
    result.message,
    'Refusing to start: OCO_CARRIER_CONTOUR must be one of "sandbox", "production" (currently "staging").',
  );
});

test("checkCarrierContourStartup: unset contour reported as unset (byte-identical message)", () => {
  const result = checkCarrierContourStartup(undefined, {});
  assert.equal(result.ok, false);
  assert.equal(result.envName, CARRIER_CONTOUR_ENV);
  assert.equal(
    result.message,
    'Refusing to start: OCO_CARRIER_CONTOUR must be one of "sandbox", "production" (currently unset).',
  );
});
