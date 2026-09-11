import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import {
  findRedeemableVerification,
  redeemVerification,
} from "../../apps/web/lib/auth/redeem-verification-token.ts";
import {
  refusedVerificationDestination,
  VERIFIED_ALREADY_PATH,
  verifiedToastText,
  VERIFY_ERROR_PATH,
  VERIFY_STALE_PATH,
} from "../../apps/web/lib/auth/verification-redirects.ts";
import { PROTOTYPE_KEYS } from "../helpers/prototype-keys.mjs";
import { getTestPrisma, truncateAll } from "../helpers/test-db.mjs";

/**
 * THE FIRST TESTS THIS PATH HAS EVER HAD — recorded as an open item in
 * docs/ROADMAP.md on 08.09.2026, «на пути верификации нет НИ ОДНОГО теста».
 *
 * The route itself is not tested here and cannot be (auth + Prisma + Next — see
 * CLAUDE.md, anti-regression rule 1). What it decides was moved into two
 * modules so that it could be: the refusal destination is pure, and redemption
 * takes its client as a parameter. Both were first extracted with the route's
 * behaviour UNCHANGED, and the two tests marked «was PIN» below were written
 * against that extraction and passed on it — reproducing both defects — before
 * either was fixed. They were then inverted.
 */

/** @type {import("@prisma/client").PrismaClient} */
let prisma;

beforeEach(async () => {
  prisma = getTestPrisma();
  await truncateAll(prisma);
});

afterEach(async () => {
  await truncateAll(prisma);
});

let seq = 0;

function fresh(label) {
  seq += 1;
  return `${label}-${Date.now()}-${seq}`;
}

const HOUR_MS = 60 * 60 * 1000;

/** A user holding `token`, expiring `expiresInMs` from now. */
async function seedUser({ token, expiresInMs = HOUR_MS, emailVerified = false }) {
  const company = await prisma.company.create({
    data: { name: "Verify test", contactEmail: `${fresh("co")}@example.test` },
  });
  return prisma.user.create({
    data: {
      companyId: company.id,
      email: `${fresh("user")}@example.test`,
      passwordHash: "not-a-real-hash",
      emailVerified,
      verificationToken: token,
      verificationTokenExpiry:
        token === null ? null : new Date(Date.now() + expiresInMs),
    },
  });
}

function reread(id) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      emailVerified: true,
      verificationToken: true,
      verificationTokenExpiry: true,
    },
  });
}

// ── A: where a refusal sends the person (pure — the database is not touched)

describe("refusedVerificationDestination", () => {
  test("no session → the error page", () => {
    assert.equal(refusedVerificationDestination(null), VERIFY_ERROR_PATH);
  });

  test("signed in, email NOT yet confirmed → the page with the resend button", () => {
    assert.equal(
      refusedVerificationDestination({ emailVerified: false }),
      VERIFY_STALE_PATH,
    );
  });

  // was PIN — passed on the unchanged extraction with VERIFY_STALE_PATH.
  test("signed in, email ALREADY confirmed → the dashboard, not the stale page", () => {
    // The stale page redirected a confirmed seller to the dashboard in
    // silence. Measured in a live check 11.09.2026.
    assert.equal(
      refusedVerificationDestination({ emailVerified: true }),
      VERIFIED_ALREADY_PATH,
    );
  });
});

describe("verifiedToastText", () => {
  test("the success value keeps its original text, character for character", () => {
    assert.equal(verifiedToastText("true"), "Email подтверждён ✓");
  });

  test("the already-confirmed value says the link is no longer needed", () => {
    assert.equal(
      verifiedToastText("already"),
      "Email уже подтверждён — ссылка больше не нужна.",
    );
  });

  test("no value, or one we never issue → no toast", () => {
    assert.equal(verifiedToastText(null), null);
    assert.equal(verifiedToastText(""), null);
    assert.equal(verifiedToastText("yes"), null);
    assert.equal(verifiedToastText("TRUE"), null);
  });

  test("prototype-chain names in the address bar never resolve to a message", () => {
    for (const key of PROTOTYPE_KEYS) {
      assert.equal(verifiedToastText(key), null, key);
    }
  });

  test("the value the route issues for «already confirmed» is one the toast knows", () => {
    // KEY PRESENCE, not a resolved value: verifiedToastText falls back to null,
    // so comparing texts would pass on a renamed key that no longer matches. A
    // non-null result is what proves the route and the toast still agree.
    const issued = new URL(VERIFIED_ALREADY_PATH, "http://local.test")
      .searchParams.get("verified");
    assert.equal(typeof issued, "string");
    assert.notEqual(verifiedToastText(issued), null, `unknown to the toast: ${issued}`);
  });
});

// ── B: reading a token, and redeeming it

describe("findRedeemableVerification", () => {
  test("a live token → its row", async () => {
    const token = fresh("tok");
    const user = await seedUser({ token });
    assert.deepEqual(await findRedeemableVerification(prisma, token), {
      id: user.id,
    });
  });

  test("an unknown token → null", async () => {
    await seedUser({ token: fresh("tok") });
    assert.equal(await findRedeemableVerification(prisma, fresh("other")), null);
  });

  test("an expired token → null", async () => {
    const token = fresh("tok");
    await seedUser({ token, expiresInMs: -1000 });
    assert.equal(await findRedeemableVerification(prisma, token), null);
  });
});

describe("redeemVerification", () => {
  test("the token still in the column → redeemed, both columns cleared", async () => {
    const token = fresh("tok");
    const user = await seedUser({ token });

    assert.equal(await redeemVerification(prisma, user.id, token), true);
    assert.deepEqual(await reread(user.id), {
      emailVerified: true,
      verificationToken: null,
      verificationTokenExpiry: null,
    });
  });

  // was PIN — passed on the unchanged extraction: redeemed true, emailVerified
  // true, and the NEW token nulled.
  test("a resend lands between the read and the write → the OLD request redeems nothing and the NEW token survives", async () => {
    const oldToken = fresh("old");
    const newToken = fresh("new");
    const user = await seedUser({ token: oldToken });

    // The old link's request reads its row…
    const found = await findRedeemableVerification(prisma, oldToken);
    assert.ok(found, "precondition: the old token was redeemable when read");

    // …and before it writes, a resend overwrites both columns, exactly as
    // issueVerificationToken does.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken: newToken,
        verificationTokenExpiry: new Date(Date.now() + HOUR_MS),
      },
    });

    const redeemed = await redeemVerification(prisma, found.id, oldToken);
    const after = await reread(user.id);

    assert.equal(redeemed, false, "the old link no longer holds the column");
    assert.equal(after.emailVerified, false, "nothing was confirmed by a dead link");
    assert.equal(after.verificationToken, newToken, "the NEW token is untouched");
    assert.notEqual(after.verificationTokenExpiry, null, "and so is its expiry");

    // …and the link the person just asked for still works.
    const live = await findRedeemableVerification(prisma, newToken);
    assert.deepEqual(live, { id: user.id });
    assert.equal(await redeemVerification(prisma, user.id, newToken), true);
    assert.equal((await reread(user.id)).emailVerified, true);
  });
});
