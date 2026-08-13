/**
 * The one list of Object.prototype member names our lookup tests feed in.
 *
 * WHY IT IS SHARED. Every table that resolves a string coming from outside —
 * a provider key, a status code, a reason — has the same failure mode when it
 * is written as an object literal and indexed with `obj[key]`: the index walks
 * the prototype chain, so "constructor" and friends resolve to a truthy member
 * that is not an entry, and `?? default` never fires. A Set or a Map does not
 * have that failure mode at all.
 *
 * The list is therefore NOT calibrated per call site. It is identical
 * everywhere on purpose, so that the next table — written months from now, by
 * someone who did not live through this, possibly as an object literal — is
 * caught by the test file that was copied alongside it, rather than by whoever
 * happens to remember. A Map-backed lookup importing this list is not being
 * over-tested; it is keeping the copy source correct.
 *
 * ADDING IS FINE, REMOVING IS NOT. A new name (say "isPrototypeOf") makes every
 * importing test stricter at once, which is the point. Dropping one because
 * "this table is a Map anyway" silently weakens every site that later copies
 * from it — and the copy is exactly where the object literal appears.
 *
 * Composition: the union of what the individual sites carried before they were
 * unified — order-adapter-strict-lookup had four, carrier-connect-form-helpers
 * had hasOwnProperty, the rest carried three.
 */
export const PROTOTYPE_KEYS = [
  "constructor",
  "toString",
  "__proto__",
  "valueOf",
  "hasOwnProperty",
];

/**
 * The same keys as [label, value] pairs, for the test files that build a table
 * of labelled cases and want one row per key.
 */
export const PROTOTYPE_KEY_CASES = PROTOTYPE_KEYS.map((key) => [
  `the string "${key}"`,
  key,
]);
