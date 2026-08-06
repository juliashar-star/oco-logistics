import type { PrismaClient } from "@prisma/client";
import type { CarrierCredentials } from "@oco/core/carrier-adapter/types";
import {
  getVerifyCredentialsAdapter,
  type VerifyCredentialsFn,
  type VerifyRejectedReason,
} from "@oco/core/carrier-adapter/verify-credentials-adapters";

import {
  encryptCarrierCredentials,
  isCarrierCredentialsEncryptionConfigured,
} from "../carrier-credentials";

/**
 * Connect a seller's own carrier account: check the bag, confirm encryption is
 * configured, ask the carrier, then store — in that order, each step short-circuiting.
 *
 * This is the FIRST writer of CarrierCredential. Nothing is stored unless the
 * carrier ACCEPTED the credentials: a rejected verdict and an unavailable
 * verdict both persist nothing, so a seller can never end up "connected" with a
 * bag the carrier refused, and a carrier being down never looks like success.
 *
 * Never throws for an expected outcome — every one of them is a result case.
 * No credential value appears in a result; this module logs nothing at all.
 */

/**
 * One required field of a provider's credential bag.
 * `allowed` pins a closed value set where the adapter has one.
 */
export type CarrierCredentialFieldSpec = {
  name: string;
  allowed?: readonly string[];
};

/**
 * Required fields per providerKey — MIRRORS the adapters' own assert*Credentials
 * (assertYandexCredentials, assertCdekCredentials). Kept here so the service can
 * name WHICH field is wrong, which those asserts cannot do. The adapter stays the
 * authority: anything this spec lets through is still judged by the real verifier,
 * and a drift test proves a spec-complete bag is not rejected as malformed.
 */
export const CARRIER_CREDENTIAL_FIELDS: Readonly<
  Record<string, readonly CarrierCredentialFieldSpec[]>
> = {
  yataxi: [{ name: "platformStationId" }, { name: "token" }],
  cdek: [
    { name: "account" },
    { name: "securePassword" },
    // assertCdekCredentials accepts only "1" | "2".
    { name: "contractType", allowed: ["1", "2"] },
  ],
};

export type ConnectCarrierCredentialsResult =
  /** Verified by the carrier and persisted. */
  | { status: "stored" }
  /** The bag cannot be sent at all; `field` names the offending key (never its value). */
  | { status: "invalid_shape"; field: string }
  /** The carrier answered "no". `reason` is the verifier's code, carried through unchanged. */
  | { status: "rejected_by_carrier"; reason: VerifyRejectedReason }
  /** The carrier could not answer (5xx, transport, or our own base-URL misconfiguration). */
  | { status: "carrier_unavailable" }
  /**
   * WE cannot store a bag right now — today: the encryption key is missing or
   * too short. Deliberately NOT carrier_unavailable: the carrier is fine, and
   * that wording would invite a retry which fails identically. Only an operator
   * fixing the environment clears this.
   */
  | { status: "storage_not_configured" }
  /** No adapter is registered for this providerKey — a result, never a throw. */
  | { status: "unknown_provider" };

export type ConnectCarrierCredentialsInput = {
  companyId: string;
  providerKey: string;
  credentials: CarrierCredentials;
};

export type ConnectCarrierCredentialsDeps = {
  /** Defaults to the registry getter; injected in tests to drive every branch offline. */
  getVerifier?: (providerKey: string) => VerifyCredentialsFn | undefined;
  encrypt?: (credentials: CarrierCredentials) => string;
  /** Defaults to isCarrierCredentialsEncryptionConfigured. */
  isEncryptionConfigured?: () => boolean;
};

function defaultGetVerifier(
  providerKey: string,
): VerifyCredentialsFn | undefined {
  return getVerifyCredentialsAdapter(providerKey)?.verifyCredentials;
}

/**
 * First field that is absent, blank, or outside its closed value set — or null.
 * Own-property lookup only: a providerKey like "__proto__" must not resolve.
 */
function firstInvalidField(
  providerKey: string,
  credentials: CarrierCredentials,
): string | null {
  const spec = Object.prototype.hasOwnProperty.call(
    CARRIER_CREDENTIAL_FIELDS,
    providerKey,
  )
    ? CARRIER_CREDENTIAL_FIELDS[providerKey]!
    : [];

  for (const field of spec) {
    const raw = credentials[field.name];
    if (typeof raw !== "string" || raw.trim() === "") {
      return field.name;
    }
    if (field.allowed && !field.allowed.includes(raw.trim())) {
      return field.name;
    }
  }
  return null;
}

export async function connectCarrierCredentials(
  prisma: PrismaClient,
  input: ConnectCarrierCredentialsInput,
  deps: ConnectCarrierCredentialsDeps = {},
): Promise<ConnectCarrierCredentialsResult> {
  const getVerifier = deps.getVerifier ?? defaultGetVerifier;
  const encrypt = deps.encrypt ?? encryptCarrierCredentials;
  const isEncryptionConfigured =
    deps.isEncryptionConfigured ?? isCarrierCredentialsEncryptionConfigured;

  // 1. Unknown carrier — before anything else, since neither the field spec nor
  // the check means anything without an adapter.
  const verify = getVerifier(input.providerKey);
  if (!verify) {
    return { status: "unknown_provider" };
  }

  // 2. Shape. Short-circuits before any network call.
  const badField = firstInvalidField(input.providerKey, input.credentials);
  if (badField !== null) {
    return { status: "invalid_shape", field: badField };
  }

  // 3. Can we store the outcome at all? A PRECONDITION, checked before the
  // carrier is contacted — not a try/catch around encrypt. Encrypting after an
  // accepted verdict would throw with the credentials already proven good and
  // nothing persisted, turning an answerable request into a crash.
  if (!isEncryptionConfigured()) {
    return { status: "storage_not_configured" };
  }

  // 4. Ask the carrier. The verifier never throws for an expected outcome.
  const verdict = await verify(input.credentials);
  if (verdict.status === "rejected") {
    return { status: "rejected_by_carrier", reason: verdict.reason };
  }
  // ONLY an accepted verdict may reach the write. Explicit, not a fall-through:
  // "unavailable" and any status a future build might add both land here, and a
  // status this build does not recognise must never be read as permission to
  // store. Safe answer: the carrier gave us no usable "yes".
  if (verdict.status !== "accepted") {
    return { status: "carrier_unavailable" };
  }

  // 5. Accepted → encrypt, then store. A Prisma failure below is NOT caught:
  // losing a write must surface, not be reported as a soft result.
  const credentialsEnc = encrypt(input.credentials);

  // 6. Reconnecting REPLACES the bag for this (companyId, providerKey) — the
  // pair is unique, so one carrier account per company per carrier.
  //
  // `connectedAt` is intentionally absent from `update`: it answers "since when
  // has this seller been connected to this carrier", and re-entering a rotated
  // password must not rewrite that history. It is set once, by the schema's
  // @default(now()) on create. `updatedAt` is @updatedAt, so it moves by itself
  // and answers the different question — "when did the stored bag last change".
  await prisma.carrierCredential.upsert({
    where: {
      companyId_providerKey: {
        companyId: input.companyId,
        providerKey: input.providerKey,
      },
    },
    create: {
      companyId: input.companyId,
      providerKey: input.providerKey,
      credentialsEnc,
    },
    update: { credentialsEnc },
  });

  return { status: "stored" };
}
