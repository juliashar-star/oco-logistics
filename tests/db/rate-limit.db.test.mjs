import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import {
  clearPasswordChangeAttempts,
  isLoginBlocked,
  isPasswordChangeBlocked,
  isVerifyEmailBlocked,
  recordFailedPasswordChange,
  recordVerifyEmailAttempt,
} from "../../apps/web/lib/auth/rate-limit.ts";
import { getTestPrisma, truncateAll } from "../helpers/test-db.mjs";

/**
 * The FIRST test this mechanism has ever had. It guarded nine authentication
 * paths for two months with nothing watching it, because every function reached
 * for a singleton bound to the developer's database; the client became a
 * parameter in 1e970d9 and that is what made this file possible.
 *
 * There is no unit half to lean on here — the decision and the storage are the
 * same act. Whether a caller is blocked is settled by a row's `count` against a
 * threshold and its `resetAt` against the clock, and the increment happens
 * inside one `INSERT … ON CONFLICT` in Postgres, not in application code. A test
 * without a database could only re-describe the SQL, not run it.
 */

/**
 * Thresholds and bucket names are NOT exported by the module — they are private
 * `const`s. Copied here from `apps/web/lib/auth/rate-limit.ts:43` (password
 * change) and `:52` (verify email), with the bucket strings from `:45`, `:54`
 * and `:27`. A rename on either side breaks these tests loudly rather than
 * quietly: the row is looked up by bucket name, so a changed name finds nothing.
 */
const PASSWORD_CHANGE_MAX_ATTEMPTS = 5;
const VERIFY_EMAIL_MAX_ATTEMPTS = 10;
const BUCKET_PASSWORD_CHANGE = "password-change";

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

/** Unique per call. `Date.now()` alone repeats inside one millisecond, and two
 * cases below need two keys that are genuinely different. */
function freshKey(label) {
  seq += 1;
  return `${label}-${Date.now()}-${seq}`;
}

async function recordPasswordFailures(key, times) {
  for (let i = 0; i < times; i += 1) {
    await recordFailedPasswordChange(prisma, key);
  }
}

function passwordRow(key) {
  return prisma.rateLimitBucket.findUnique({
    where: { bucket_key: { bucket: BUCKET_PASSWORD_CHANGE, key } },
  });
}

/** Pushes the window an hour into the past. The suite has no precedent for
 * faking the clock, and inventing one for a single file would be worse than
 * moving the one column the decision actually reads. */
async function expirePasswordWindow(key) {
  await prisma.rateLimitBucket.update({
    where: { bucket_key: { bucket: BUCKET_PASSWORD_CHANGE, key } },
    data: { resetAt: new Date(Date.now() - 60 * 60 * 1000) },
  });
}

describe("rate-limit", { concurrency: false }, () => {
  test("(i) a bucket with no row at all does not block", async () => {
    const key = freshKey("rl-clean");

    assert.equal(await isPasswordChangeBlocked(prisma, key), false);
    assert.equal(await isVerifyEmailBlocked(prisma, key), false);
    assert.equal(await passwordRow(key), null);
  });

  test("(ii) one below the threshold passes, the threshold itself blocks", async () => {
    const changeKey = freshKey("rl-threshold-change");

    await recordPasswordFailures(changeKey, PASSWORD_CHANGE_MAX_ATTEMPTS - 1);
    assert.equal(
      await isPasswordChangeBlocked(prisma, changeKey),
      false,
      "the fifth attempt must still be allowed to happen",
    );

    await recordPasswordFailures(changeKey, 1);
    assert.equal(await isPasswordChangeBlocked(prisma, changeKey), true);

    // The other bucket added in the same slice, and the looser of the two.
    const verifyKey = freshKey("rl-threshold-verify");

    for (let i = 0; i < VERIFY_EMAIL_MAX_ATTEMPTS - 1; i += 1) {
      await recordVerifyEmailAttempt(prisma, verifyKey);
    }
    assert.equal(await isVerifyEmailBlocked(prisma, verifyKey), false);

    await recordVerifyEmailAttempt(prisma, verifyKey);
    assert.equal(await isVerifyEmailBlocked(prisma, verifyKey), true);
  });

  test("(iii) a success clears the count, and removes the row entirely", async () => {
    const key = freshKey("rl-clear");

    await recordPasswordFailures(key, PASSWORD_CHANGE_MAX_ATTEMPTS);
    assert.equal(await isPasswordChangeBlocked(prisma, key), true);

    await clearPasswordChangeAttempts(prisma, key);

    assert.equal(await isPasswordChangeBlocked(prisma, key), false);
    assert.equal(
      await passwordRow(key),
      null,
      "clearing must delete the row, not merely zero it",
    );
  });

  test("(iv) buckets are independent: an exhausted password change leaves login open", async () => {
    const key = freshKey("rl-cross-bucket");

    await recordPasswordFailures(key, PASSWORD_CHANGE_MAX_ATTEMPTS);

    assert.equal(await isPasswordChangeBlocked(prisma, key), true);
    assert.equal(
      await isLoginBlocked(prisma, key),
      false,
      "locking someone out of changing their password must not lock them out of signing in",
    );
    assert.equal(await isVerifyEmailBlocked(prisma, key), false);
  });

  test("(v) keys are independent inside one bucket", async () => {
    const exhausted = freshKey("rl-key-a");
    const bystander = freshKey("rl-key-b");

    await recordPasswordFailures(exhausted, PASSWORD_CHANGE_MAX_ATTEMPTS);

    assert.equal(await isPasswordChangeBlocked(prisma, exhausted), true);
    assert.equal(await isPasswordChangeBlocked(prisma, bystander), false);
    assert.equal(await passwordRow(bystander), null);
  });

  test("(vi) a window that has passed stops blocking", async () => {
    const key = freshKey("rl-expired");

    await recordPasswordFailures(key, PASSWORD_CHANGE_MAX_ATTEMPTS);
    assert.equal(await isPasswordChangeBlocked(prisma, key), true);

    await expirePasswordWindow(key);

    const row = await passwordRow(key);
    assert.ok(row);
    assert.equal(
      row.count,
      PASSWORD_CHANGE_MAX_ATTEMPTS,
      "the count is untouched — only the clock moved",
    );
    assert.equal(await isPasswordChangeBlocked(prisma, key), false);
  });

  test("(vii) an attempt in an expired window restarts the count at 1", async () => {
    const key = freshKey("rl-restart");

    await recordPasswordFailures(key, PASSWORD_CHANGE_MAX_ATTEMPTS);
    await expirePasswordWindow(key);

    await recordPasswordFailures(key, 1);

    const row = await passwordRow(key);
    assert.ok(row);
    assert.equal(
      row.count,
      1,
      "an expired window starts over; a count of 6 would mean it never resets",
    );
    assert.ok(
      row.resetAt > new Date(),
      "the new attempt must open a fresh window, not keep the stale one",
    );
    assert.equal(await isPasswordChangeBlocked(prisma, key), false);
  });
});
