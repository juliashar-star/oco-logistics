import type { PrismaClient } from "@prisma/client";
import type { CarrierCredentials } from "@oco/core/carrier-adapter/types";
import {
  getVerifyCredentialsAdapter,
  type VerifyCredentialsFn,
  type VerifyRejectedReason,
} from "@oco/core/carrier-adapter/verify-credentials-adapters";

import {
  decryptCarrierCredentials,
  encryptCarrierCredentials,
  isCarrierCredentialsEncryptionConfigured,
} from "../carrier-credentials";
import { mergeSubmittedCredentials } from "./merge-submitted-credentials";

/**
 * Connect a seller's own carrier account, in this order, each step
 * short-circuiting:
 *
 *   1. resolve the carrier            unknown key → a result, not a throw
 *   2. confirm encryption is usable   before reading anything secret
 *   3. LOAD the stored bag and MERGE  the submission over it
 *   4. shape-check the MERGED bag
 *   5. ask the carrier about the MERGED bag
 *   6. encrypt the MERGED bag and store it
 *
 * The merge is why steps 4 and 5 say MERGED: the card promises a connected
 * seller that an empty field keeps its current value, so blanks are filled from
 * storage BEFORE anything is validated or sent. What the carrier verifies and
 * what lands in the row are the same complete bag — never the partial
 * submission. Submitted keys outside the carrier's spec are dropped at the
 * merge; stored keys are not.
 *
 * This is the FIRST writer of CarrierCredential. Nothing is stored unless the
 * carrier ACCEPTED the credentials: a rejected verdict and an unavailable
 * verdict both persist nothing, so a seller can never end up "connected" with a
 * bag the carrier refused, a carrier being down never looks like success, and a
 * mistyped field cannot cost a seller a working connection.
 *
 * Never throws for an expected outcome — every one of them is a result case.
 * No credential value appears in a result; this module logs nothing at all.
 */

/**
 * MOVED to `./carrier-credential-fields`, re-exported here so every existing
 * importer keeps working unchanged. The move is not tidying: this module's
 * import chain reaches `node:crypto`, and the carrier picker — a CLIENT
 * component — now asks the same map whether a carrier can be connected. A leaf
 * module with no imports is the only shape that can answer both sides without
 * dragging a Node builtin into the browser bundle.
 */
import {
  CARRIER_CREDENTIAL_FIELDS,
  type CarrierCredentialFieldSpec,
} from "./carrier-credential-fields";

export {
  CARRIER_CREDENTIAL_FIELDS,
  isConnectableByOco,
  type CarrierCredentialFieldSpec,
} from "./carrier-credential-fields";

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

/**
 * The bag a merge starts from.
 *
 * `unreadable` is kept apart from a throw on purpose: a decrypt failure is an
 * operator fault (the key changed or was lost), while a Prisma failure is not,
 * and `getCarrierCredentials` collapses both into one throw. Telling them apart
 * afterwards would mean matching on an error message.
 */
export type StoredBagLoad =
  | { status: "found"; credentials: CarrierCredentials }
  | { status: "absent" }
  | { status: "unreadable" };

export type ConnectCarrierCredentialsDeps = {
  /** Defaults to the registry getter; injected in tests to drive every branch offline. */
  getVerifier?: (providerKey: string) => VerifyCredentialsFn | undefined;
  encrypt?: (credentials: CarrierCredentials) => string;
  /** Defaults to isCarrierCredentialsEncryptionConfigured. */
  isEncryptionConfigured?: () => boolean;
  /** Defaults to a findUnique + decrypt of this (company, provider). */
  loadStored?: (
    companyId: string,
    providerKey: string,
  ) => Promise<StoredBagLoad>;
};

function defaultGetVerifier(
  providerKey: string,
): VerifyCredentialsFn | undefined {
  return getVerifyCredentialsAdapter(providerKey)?.verifyCredentials;
}

/**
 * Read the stored bag for a merge. The row lookup is NOT wrapped: a Prisma
 * failure must surface as a failure, not be reported as a storage misconfig.
 * Only the decrypt is caught, and only into `unreadable`.
 */
async function defaultLoadStored(
  prisma: PrismaClient,
  companyId: string,
  providerKey: string,
): Promise<StoredBagLoad> {
  const row = await prisma.carrierCredential.findUnique({
    where: { companyId_providerKey: { companyId, providerKey } },
  });
  if (!row) {
    return { status: "absent" };
  }
  try {
    return {
      status: "found",
      credentials: decryptCarrierCredentials(row.credentialsEnc),
    };
  } catch {
    // No detail escapes: the ciphertext and the key stay out of the result.
    return { status: "unreadable" };
  }
}

/**
 * This carrier's field spec, or an empty one.
 * Own-property lookup only: a providerKey like "__proto__" must not resolve.
 */
function specFor(providerKey: string): readonly CarrierCredentialFieldSpec[] {
  return Object.prototype.hasOwnProperty.call(
    CARRIER_CREDENTIAL_FIELDS,
    providerKey,
  )
    ? CARRIER_CREDENTIAL_FIELDS[providerKey]!
    : [];
}

/**
 * First field that is absent, blank, or outside its closed value set — or null.
 */
function firstInvalidField(
  providerKey: string,
  credentials: CarrierCredentials,
): string | null {
  const spec = specFor(providerKey);

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
  const loadStored =
    deps.loadStored ??
    ((companyId: string, providerKey: string) =>
      defaultLoadStored(prisma, companyId, providerKey));

  // 1. Unknown carrier — before anything else, since neither the field spec nor
  // the check means anything without an adapter.
  const verify = getVerifier(input.providerKey);
  if (!verify) {
    return { status: "unknown_provider" };
  }

  // 2. Can we store the outcome at all? A PRECONDITION, and now the first thing
  // after resolving the carrier: if the key is missing there is no point reading
  // the stored bag, because decrypting it would fail for the same reason.
  if (!isEncryptionConfigured()) {
    return { status: "storage_not_configured" };
  }

  // 3. Merge over what is already stored. The card promises a connected seller
  // that an empty field keeps the current value, so a field they left alone must
  // not travel to the carrier — or to the row — as an empty string.
  const loaded = await loadStored(input.companyId, input.providerKey);
  if (loaded.status === "unreadable") {
    // Same operator fault as a missing key: the key changed or was lost. A retry
    // fails identically, so it must not read as a carrier problem.
    return { status: "storage_not_configured" };
  }
  // The submitted map is narrowed to this carrier's spec fields; the stored bag
  // is not. See mergeSubmittedCredentials for why the two sides differ.
  const credentials = mergeSubmittedCredentials(
    loaded.status === "found" ? loaded.credentials : {},
    input.credentials,
    specFor(input.providerKey).map((field) => field.name),
  );

  // 4. Shape, on the MERGED bag — never the partial submission. With nothing
  // stored, merging adds nothing and this fails exactly as it did before, naming
  // the field the seller left empty.
  const badField = firstInvalidField(input.providerKey, credentials);
  if (badField !== null) {
    return { status: "invalid_shape", field: badField };
  }

  // 5. Ask the carrier about the MERGED bag — the partial submission is never
  // sent: a stored token the seller did not retype is part of what must be
  // verified, and an accepted verdict must mean "this whole bag works".
  const verdict = await verify(credentials);
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

  // 6. Accepted → encrypt the MERGED bag, then store. A Prisma failure below is
  // NOT caught: losing a write must surface, not be reported as a soft result.
  //
  // Every earlier return leaves the row untouched — a rejected or unavailable
  // verdict cannot cost a seller a working connection, because nothing is
  // written until here.
  const credentialsEnc = encrypt(credentials);

  // 7. The write replaces the row's bag with the MERGED one, so fields the
  // seller left empty keep their stored values. (companyId, providerKey) is
  // unique — one carrier account per company per carrier.
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
