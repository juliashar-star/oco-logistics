import assert from "node:assert/strict";
import test from "node:test";

import {
  CARRIER_CREDENTIAL_FIELDS,
  connectCarrierCredentials,
} from "../apps/web/lib/carriers/connect-carrier-credentials.ts";
import { mergeSubmittedCredentials } from "../apps/web/lib/carriers/merge-submitted-credentials.ts";
import { VERIFY_CREDENTIALS_ADAPTERS } from "../packages/core/src/carrier-adapter/verify-credentials-adapters.ts";
import { PROTOTYPE_KEYS } from "./helpers/prototype-keys.mjs";

const YANDEX_BAG = { platformStationId: "station-1", token: "tok-secret-xyz" };
const CDEK_BAG = {
  account: "acct-1",
  securePassword: "cdek-secret-must-not-leak",
  contractType: "1",
};

/**
 * Prisma stand-in that throws on ANY property access — the whole surface, not a
 * hand-listed few methods. Every branch that must not persist is asserted with
 * this, so "stores nothing" is proved rather than assumed.
 */
function prismaThatMustNotBeTouched() {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        throw new Error(
          `prisma must not be touched on this branch (accessed: ${String(prop)})`,
        );
      },
    },
  );
}

/** Records the single upsert a storing branch is expected to make. */
function recordingPrisma() {
  const calls = [];
  return {
    calls,
    client: {
      carrierCredential: {
        async upsert(args) {
          calls.push(args);
          return { id: "row-1" };
        },
      },
    },
  };
}

/** Storage precondition satisfied — the default for branches past step 3. */
/**
 * Storage precondition satisfied and nothing stored yet — the default for
 * branches past step 4. `loadStored` is injected so no branch reaches Prisma.
 */
const storable = {
  isEncryptionConfigured: () => true,
  loadStored: async () => ({ status: "absent" }),
};

/** Deps whose merge starts from an existing stored bag. */
const storedBag = (credentials) => ({
  ...storable,
  loadStored: async () => ({ status: "found", credentials }),
});

const verifierReturning = (verdict) => {
  const calls = [];
  return {
    calls,
    ...storable,
    getVerifier: () => async (credentials) => {
      calls.push(credentials);
      return verdict;
    },
  };
};

// ── unknown provider

test("unknown providerKey → unknown_provider result, never a throw, nothing stored", async () => {
  const result = await connectCarrierCredentials(
    prismaThatMustNotBeTouched(),
    { companyId: "c1", providerKey: "not-a-carrier", credentials: YANDEX_BAG },
    { ...storable, getVerifier: () => undefined },
  );
  assert.deepEqual(result, { status: "unknown_provider" });
});

test("prototype-chain providerKey → unknown_provider, resolved by own-property only", async () => {
  for (const key of PROTOTYPE_KEYS) {
    const result = await connectCarrierCredentials(
      prismaThatMustNotBeTouched(),
      { companyId: "c1", providerKey: key, credentials: YANDEX_BAG },
      {
        ...storable,
        getVerifier: (k) => VERIFY_CREDENTIALS_ADAPTERS[k]?.verifyCredentials,
      },
    );
    assert.deepEqual(result, { status: "unknown_provider" }, key);
  }
});

// ── shape, checked BEFORE the carrier is contacted

test("yandex bag missing token → invalid_shape naming the field, verifier never called", async () => {
  const verifier = verifierReturning({ status: "accepted" });
  const result = await connectCarrierCredentials(
    prismaThatMustNotBeTouched(),
    {
      companyId: "c1",
      providerKey: "yataxi",
      credentials: { platformStationId: "station-1" },
    },
    verifier,
  );
  assert.deepEqual(result, { status: "invalid_shape", field: "token" });
  assert.equal(verifier.calls.length, 0);
});

test("cdek bag with a blank securePassword → invalid_shape, verifier never called", async () => {
  const verifier = verifierReturning({ status: "accepted" });
  const result = await connectCarrierCredentials(
    prismaThatMustNotBeTouched(),
    {
      companyId: "c1",
      providerKey: "cdek",
      credentials: { ...CDEK_BAG, securePassword: "   " },
    },
    verifier,
  );
  assert.deepEqual(result, { status: "invalid_shape", field: "securePassword" });
  assert.equal(verifier.calls.length, 0);
});

test("cdek contractType outside the closed set → invalid_shape on that field", async () => {
  const verifier = verifierReturning({ status: "accepted" });
  const result = await connectCarrierCredentials(
    prismaThatMustNotBeTouched(),
    {
      companyId: "c1",
      providerKey: "cdek",
      credentials: { ...CDEK_BAG, contractType: "3" },
    },
    verifier,
  );
  assert.deepEqual(result, { status: "invalid_shape", field: "contractType" });
  assert.equal(verifier.calls.length, 0);
});

// ── storage precondition, checked BEFORE the carrier is called

test("encryption key not configured → storage_not_configured, and the carrier is NEVER called", async () => {
  const result = await connectCarrierCredentials(
    prismaThatMustNotBeTouched(),
    { companyId: "c1", providerKey: "yataxi", credentials: YANDEX_BAG },
    {
      isEncryptionConfigured: () => false,
      // Throws if reached: proves the precondition short-circuits before the network.
      getVerifier: () => async () => {
        throw new Error("verifier must not be called when storage is unavailable");
      },
    },
  );
  assert.deepEqual(result, { status: "storage_not_configured" });
});

test("storage_not_configured is NOT carrier_unavailable — the two stay distinct", async () => {
  const notConfigured = await connectCarrierCredentials(
    prismaThatMustNotBeTouched(),
    { companyId: "c1", providerKey: "cdek", credentials: CDEK_BAG },
    {
      isEncryptionConfigured: () => false,
      getVerifier: () => async () => ({ status: "unavailable" }),
    },
  );
  const carrierDown = await connectCarrierCredentials(
    prismaThatMustNotBeTouched(),
    { companyId: "c1", providerKey: "cdek", credentials: CDEK_BAG },
    { ...storable, getVerifier: () => async () => ({ status: "unavailable" }) },
  );
  assert.deepEqual(notConfigured, { status: "storage_not_configured" });
  assert.deepEqual(carrierDown, { status: "carrier_unavailable" });
  assert.notDeepEqual(notConfigured, carrierDown);
});

test("the precondition never encrypts — nothing is encrypted before an accepted verdict", async () => {
  let encryptCalls = 0;
  await connectCarrierCredentials(
    prismaThatMustNotBeTouched(),
    { companyId: "c1", providerKey: "yataxi", credentials: YANDEX_BAG },
    {
      isEncryptionConfigured: () => false,
      getVerifier: () => async () => ({ status: "accepted" }),
      encrypt: () => {
        encryptCalls += 1;
        return "enc";
      },
    },
  );
  assert.equal(encryptCalls, 0);
});

// ── the merge

const YANDEX_NAMES = ["platformStationId", "token"];

test("mergeSubmittedCredentials: stored fields the seller did not supply survive", () => {
  assert.deepEqual(
    mergeSubmittedCredentials(
      { platformStationId: "stored-station", token: "stored-token" },
      { token: "new-token" },
      YANDEX_NAMES,
    ),
    { platformStationId: "stored-station", token: "new-token" },
  );
});

test("mergeSubmittedCredentials: a blank or absent field never overwrites a stored one", () => {
  const stored = { platformStationId: "stored-station", token: "stored-token" };
  for (const submitted of [{}, { token: "" }, { token: "   " }]) {
    assert.deepEqual(
      mergeSubmittedCredentials(stored, submitted, YANDEX_NAMES),
      stored,
      JSON.stringify(submitted),
    );
  }
});

test("mergeSubmittedCredentials: a supplied field wins over the stored one", () => {
  assert.deepEqual(
    mergeSubmittedCredentials({ token: "old" }, { token: "new" }, YANDEX_NAMES),
    { token: "new" },
  );
});

test("mergeSubmittedCredentials: nothing stored → the submission, blanks dropped", () => {
  assert.deepEqual(
    mergeSubmittedCredentials(
      {},
      { token: "new", platformStationId: "  " },
      YANDEX_NAMES,
    ),
    { token: "new" },
  );
});

test("mergeSubmittedCredentials: a SUBMITTED key outside the spec never enters the bag", () => {
  const merged = mergeSubmittedCredentials(
    { token: "stored-token" },
    { token: "new-token", smuggled: "value", account: "wrong-carrier" },
    YANDEX_NAMES,
  );
  assert.deepEqual(merged, { token: "new-token" });
  assert.equal(Object.prototype.hasOwnProperty.call(merged, "smuggled"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(merged, "account"), false);
});

test("mergeSubmittedCredentials: a submitted «__proto__» is dropped and pollutes nothing", () => {
  const merged = mergeSubmittedCredentials(
    {},
    { ["__proto__"]: "polluted", token: "t" },
    YANDEX_NAMES,
  );
  assert.equal(Object.getPrototypeOf(merged), Object.prototype);
  assert.equal({}.polluted, undefined);
  assert.equal(
    Object.prototype.hasOwnProperty.call(merged, "__proto__"),
    false,
    "not in the spec, so it never enters the bag at all",
  );
});

test("mergeSubmittedCredentials: a STORED key outside the spec survives untouched", () => {
  // Stored keys arrived by a trusted path; a field this build does not know may
  // belong to an older or newer one. Dropping it would silently lose data.
  assert.deepEqual(
    mergeSubmittedCredentials(
      { token: "stored-token", legacyField: "keep-me" },
      { token: "new-token" },
      YANDEX_NAMES,
    ),
    { token: "new-token", legacyField: "keep-me" },
  );
});

test("merge: a resubmitted field is combined with stored ones before anything else", async () => {
  const prisma = recordingPrisma();
  const verifier = {
    ...storedBag({
      platformStationId: "stored-station",
      token: "stored-token",
    }),
    getVerifier: () => async (credentials) => {
      seen.push(credentials);
      return { status: "accepted" };
    },
    encrypt: (credentials) => JSON.stringify(credentials),
  };
  const seen = [];

  const result = await connectCarrierCredentials(
    prisma.client,
    {
      companyId: "c1",
      providerKey: "yataxi",
      credentials: { token: "typed-token" },
    },
    verifier,
  );

  assert.deepEqual(result, { status: "stored" });
  // The MERGED bag is what got stored, not the one-field submission.
  assert.deepEqual(JSON.parse(prisma.calls[0].update.credentialsEnc), {
    platformStationId: "stored-station",
    token: "typed-token",
  });
});

test("merge: the VERIFIER receives the merged bag, never the partial submission", async () => {
  const seen = [];
  const prisma = recordingPrisma();

  await connectCarrierCredentials(
    prisma.client,
    {
      companyId: "c1",
      providerKey: "yataxi",
      credentials: { token: "typed-token" },
    },
    {
      ...storedBag({
        platformStationId: "stored-station",
        token: "stored-token",
      }),
      getVerifier: () => async (credentials) => {
        seen.push(credentials);
        return { status: "accepted" };
      },
      encrypt: () => "ENCRYPTED-BLOB",
    },
  );

  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0], {
    platformStationId: "stored-station",
    token: "typed-token",
  });
});

test("merge: a partial submission with NOTHING stored still fails the shape check by name", async () => {
  const result = await connectCarrierCredentials(
    prismaThatMustNotBeTouched(),
    {
      companyId: "c1",
      providerKey: "yataxi",
      credentials: { token: "typed-token" },
    },
    verifierReturning({ status: "accepted" }),
  );
  assert.deepEqual(result, {
    status: "invalid_shape",
    field: "platformStationId",
  });
});

test("a submitted key outside the spec reaches neither the verifier nor the row", async () => {
  const seen = [];
  const prisma = recordingPrisma();

  const result = await connectCarrierCredentials(
    prisma.client,
    {
      companyId: "c1",
      providerKey: "yataxi",
      credentials: {
        platformStationId: "station-1",
        token: "tok",
        smuggled: "must-not-travel",
      },
    },
    {
      ...storedBag({ token: "stored-token" }),
      getVerifier: () => async (credentials) => {
        seen.push(credentials);
        return { status: "accepted" };
      },
      encrypt: (credentials) => JSON.stringify(credentials),
    },
  );

  assert.deepEqual(result, { status: "stored" });
  assert.deepEqual(seen[0], { platformStationId: "station-1", token: "tok" });
  assert.ok(!JSON.stringify(seen[0]).includes("must-not-travel"));
  assert.ok(
    !prisma.calls[0].update.credentialsEnc.includes("must-not-travel"),
    "an unlisted key must not be encrypted into the row",
  );
});

test("ORDER: the storage precondition runs BEFORE the stored bag is read", async () => {
  // Not merely "the verifier is not called": if the precondition moved after the
  // load, a decrypt would run first with a key we already know is unusable.
  // A loader that throws makes that ordering observable.
  const result = await connectCarrierCredentials(
    prismaThatMustNotBeTouched(),
    { companyId: "c1", providerKey: "yataxi", credentials: YANDEX_BAG },
    {
      isEncryptionConfigured: () => false,
      loadStored: async () => {
        throw new Error(
          "the stored bag must not be read when encryption is unusable",
        );
      },
      getVerifier: () => async () => ({ status: "accepted" }),
    },
  );
  assert.deepEqual(result, { status: "storage_not_configured" });
});

test("an unreadable stored bag → storage_not_configured, and the carrier is NEVER called", async () => {
  const result = await connectCarrierCredentials(
    prismaThatMustNotBeTouched(),
    { companyId: "c1", providerKey: "yataxi", credentials: YANDEX_BAG },
    {
      isEncryptionConfigured: () => true,
      loadStored: async () => ({ status: "unreadable" }),
      getVerifier: () => async () => {
        throw new Error("verifier must not be called when the bag is unreadable");
      },
    },
  );
  assert.deepEqual(result, { status: "storage_not_configured" });
});

// ── carrier verdicts

test("rejected verdict → rejected_by_carrier, reason carried through UNCHANGED, nothing stored", async () => {
  for (const reason of [
    "invalid_auth",
    "invalid_source_station",
    "malformed_credentials",
  ]) {
    const result = await connectCarrierCredentials(
      prismaThatMustNotBeTouched(),
      { companyId: "c1", providerKey: "yataxi", credentials: YANDEX_BAG },
      {
        ...storable,
        getVerifier: () => async () => ({ status: "rejected", reason }),
      },
    );
    assert.deepEqual(result, { status: "rejected_by_carrier", reason }, reason);
  }
});

test("unavailable verdict → carrier_unavailable, nothing stored", async () => {
  const result = await connectCarrierCredentials(
    prismaThatMustNotBeTouched(),
    { companyId: "c1", providerKey: "cdek", credentials: CDEK_BAG },
    { ...storable, getVerifier: () => async () => ({ status: "unavailable" }) },
  );
  assert.deepEqual(result, { status: "carrier_unavailable" });
});

test("UNRECOGNISED verdict status → nothing stored; only «accepted» opens the write", async () => {
  for (const status of ["accepted_maybe", "ok", "", "pending"]) {
    const result = await connectCarrierCredentials(
      prismaThatMustNotBeTouched(),
      { companyId: "c1", providerKey: "yataxi", credentials: YANDEX_BAG },
      { ...storable, getVerifier: () => async () => ({ status }) },
    );
    assert.deepEqual(result, { status: "carrier_unavailable" }, status);
  }
});

test("a rejected verdict never encrypts — encryption happens only after acceptance", async () => {
  let encryptCalls = 0;
  await connectCarrierCredentials(
    prismaThatMustNotBeTouched(),
    { companyId: "c1", providerKey: "yataxi", credentials: YANDEX_BAG },
    {
      ...storable,
      getVerifier: () => async () => ({
        status: "rejected",
        reason: "invalid_auth",
      }),
      encrypt: () => {
        encryptCalls += 1;
        return "enc";
      },
    },
  );
  assert.equal(encryptCalls, 0);
});

// ── accepted → the one write

test("accepted verdict → stored, exactly one upsert, keyed on (companyId, providerKey)", async () => {
  const prisma = recordingPrisma();
  const result = await connectCarrierCredentials(
    prisma.client,
    { companyId: "co-42", providerKey: "yataxi", credentials: YANDEX_BAG },
    {
      ...storable,
      getVerifier: () => async () => ({ status: "accepted" }),
      encrypt: () => "ENCRYPTED-BLOB",
    },
  );

  assert.deepEqual(result, { status: "stored" });
  assert.equal(prisma.calls.length, 1);
  const args = prisma.calls[0];
  assert.deepEqual(args.where, {
    companyId_providerKey: { companyId: "co-42", providerKey: "yataxi" },
  });
  assert.deepEqual(args.create, {
    companyId: "co-42",
    providerKey: "yataxi",
    credentialsEnc: "ENCRYPTED-BLOB",
  });
  assert.deepEqual(args.update, { credentialsEnc: "ENCRYPTED-BLOB" });
});

test("the upsert never writes connectedAt — first-connection time must survive a reconnect", async () => {
  const prisma = recordingPrisma();
  await connectCarrierCredentials(
    prisma.client,
    { companyId: "co-42", providerKey: "cdek", credentials: CDEK_BAG },
    {
      ...storable,
      getVerifier: () => async () => ({ status: "accepted" }),
      encrypt: () => "ENCRYPTED-BLOB",
    },
  );
  const args = prisma.calls[0];
  assert.ok(!("connectedAt" in args.update), "update must not touch connectedAt");
  assert.ok(
    !("connectedAt" in args.create),
    "create leaves connectedAt to the schema default",
  );
  assert.ok(!("updatedAt" in args.update), "updatedAt is @updatedAt, set by Prisma");
});

test("what the caller sees carries no credential value, on any branch", async () => {
  const secrets = [YANDEX_BAG.token, CDEK_BAG.securePassword, CDEK_BAG.account];
  const branches = [
    [{ status: "accepted" }, "yataxi", YANDEX_BAG, true],
    [{ status: "rejected", reason: "invalid_auth" }, "yataxi", YANDEX_BAG, true],
    [{ status: "unavailable" }, "cdek", CDEK_BAG, true],
    [{ status: "accepted" }, "cdek", CDEK_BAG, false],
  ];
  for (const [verdict, providerKey, credentials, configured] of branches) {
    const prisma = recordingPrisma();
    const result = await connectCarrierCredentials(
      prisma.client,
      { companyId: "c1", providerKey, credentials },
      {
        isEncryptionConfigured: () => configured,
        loadStored: async () => ({ status: "absent" }),
        getVerifier: () => async () => verdict,
        encrypt: () => "ENCRYPTED-BLOB",
      },
    );
    const serialized = JSON.stringify(result);
    for (const secret of secrets) {
      assert.ok(
        !serialized.includes(secret),
        `result leaked a credential value on ${result.status}`,
      );
    }
  }
});

// ── drift: the local field spec must not fall behind the adapters' own asserts

test("DRIFT GUARD: every spec providerKey is a registered verify adapter, and vice versa", () => {
  for (const key of Object.keys(CARRIER_CREDENTIAL_FIELDS)) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(VERIFY_CREDENTIALS_ADAPTERS, key),
      `spec key ${key} has no verify adapter`,
    );
  }
  for (const key of Object.keys(VERIFY_CREDENTIALS_ADAPTERS)) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(CARRIER_CREDENTIAL_FIELDS, key),
      `verify adapter ${key} has no field spec (a bag would pass unchecked)`,
    );
  }
});

/** Build a bag from the spec alone, optionally leaving one field out. */
function bagFromSpec(providerKey, spec, omitName) {
  const bag = {};
  for (const field of spec) {
    if (field.name === omitName) continue;
    bag[field.name] = field.allowed
      ? field.allowed[0]
      : `spec-${providerKey}-${field.name}`;
  }
  return bag;
}

test("DRIFT GUARD: a spec-complete bag is not rejected as malformed by the real adapter", async () => {
  // Catches a field ADDED to assert*Credentials but missing from the spec: the
  // real verifier would answer rejected/malformed_credentials and this fails.
  const originalFetch = globalThis.fetch;
  const saved = {
    CDEK_BASE_URL: process.env.CDEK_BASE_URL,
    YANDEX_DELIVERY_BASE_URL: process.env.YANDEX_DELIVERY_BASE_URL,
  };
  process.env.CDEK_BASE_URL = "https://api.edu.cdek.ru";
  process.env.YANDEX_DELIVERY_BASE_URL = "https://b2b.taxi.tst.yandex.net";
  globalThis.fetch = async (url) =>
    String(url).includes("/v2/oauth/token")
      ? Response.json({ access_token: "tok", expires_in: 3600 }, { status: 200 })
      : Response.json({ pricing_total: "1 RUB", delivery_days: 1 }, { status: 200 });

  try {
    for (const [providerKey, spec] of Object.entries(CARRIER_CREDENTIAL_FIELDS)) {
      const verdict = await VERIFY_CREDENTIALS_ADAPTERS[
        providerKey
      ].verifyCredentials(bagFromSpec(providerKey, spec));
      assert.notDeepEqual(
        verdict,
        { status: "rejected", reason: "malformed_credentials" },
        `${providerKey}: CARRIER_CREDENTIAL_FIELDS is missing a field the adapter requires`,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
    process.env.CDEK_BASE_URL = saved.CDEK_BASE_URL;
    process.env.YANDEX_DELIVERY_BASE_URL = saved.YANDEX_DELIVERY_BASE_URL;
  }
});

test("DRIFT GUARD: every spec field is genuinely required — omitting it makes the real adapter report malformed", async () => {
  // The opposite direction: catches a field REMOVED from assert*Credentials but
  // still demanded by the spec. If an omission is tolerated, the field is no
  // longer required and we would be refusing valid bags forever.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("no network expected: a malformed bag is refused before any call");
  };
  try {
    for (const [providerKey, spec] of Object.entries(CARRIER_CREDENTIAL_FIELDS)) {
      for (const omitted of spec) {
        const verdict = await VERIFY_CREDENTIALS_ADAPTERS[
          providerKey
        ].verifyCredentials(bagFromSpec(providerKey, spec, omitted.name));
        assert.deepEqual(
          verdict,
          { status: "rejected", reason: "malformed_credentials" },
          `${providerKey}: omitting ${omitted.name} was tolerated — the adapter does not require it`,
        );
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
