import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE BOUNDARY BETWEEN A REAL NAME AND A MASKED ONE.
 *
 * Decided 18.08 (`docs/DECISIONS.md`): inside the seller's cabinet a carrier is
 * named — «СДЭК», «Яндекс Доставка» — because the seller connected it
 * themselves and hiding the name costs them the ability to act on what they
 * read. Masking stays on the PUBLIC site, where it is a secrecy measure about
 * who OCO works with.
 *
 * The rule existed and was not kept: the picker screen inside the cabinet still
 * called the masking helper, so one carrier had three names across the cabinet —
 * «Перевозчик №2» in the picker, «СДЭК» in the settings tab and in the shipments
 * list.
 *
 * WHY THIS GUARD IS INVERTED, and it is a deliberate choice. Enumerating
 * «cabinet screens» would need transitive import resolution — a component is
 * cabinet-ish only because something that renders CabinetShell eventually
 * imports it — and a hand-written list of cabinet files is exactly the second
 * list this repository keeps learning not to write. So the scan is structural
 * over the WHOLE tree, and what is written by hand is the short list of PUBLIC
 * exceptions, each with its reason. A new cabinet caller is caught because it is
 * not on that list, without anyone maintaining a list of cabinet files.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE DOES NOT CATCH. Read this before trusting it.
 *
 * It is a STATIC SCAN over source text. It watches three ways a name can be
 * FETCHED — the masking helper, the registry, the mask map — and each of the
 * three is a shape we have got wrong here or could have. **One way past it is
 * known and deliberately left open:**
 *
 * PRINTING A NAME THAT ALREADY ARRIVED AS A STRING. `RankedCarrier` carries
 * `displayName` (packages/core/src/carrier-picker/rank.ts:204), so a screen can
 * render `carrier.displayName` straight from a recommend response — importing
 * nothing and calling nothing. No half sees that, and none can.
 *
 * CLOSING IT WITH A SCANNER IS NOT POSSIBLE: a carrier's name can reach a
 * component as an ordinary string on any server response, and no pattern over
 * source distinguishes that string from any other. Removing `displayName` from
 * the DTO was considered and rejected — see `docs/DECISIONS.md`, 04.09.2026.
 *
 * So: this guard catches how a name is OBTAINED, not what is finally printed.
 * It does not prove names are correct everywhere. **A guard believed to catch
 * everything is more dangerous than no guard at all** — it stops people
 * looking.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const WEB_ROOT = fileURLToPath(new URL("../apps/web/", import.meta.url));
const MASKING_HELPER = "providerSellerDisplayName";

/**
 * The only places allowed to mask. Each is public-facing or addressed to the
 * outside; none is a screen the seller works in.
 */
const PUBLIC_CALLERS = new Set([
  // NOT the landing page: it reads PROVIDER_SELLER_DISPLAY_NAMES directly and
  // drops any row it cannot mask, because this helper falls back to the REAL
  // registry name for an unmasked key — on a public page that is the leak. Its
  // own comment says so. Listing it here would have been a stale entry, and the
  // third test below is what caught that when it was written.
  //
  // The public carrier comparison table.
  "app/carrier-comparison/page.tsx",
  // The public (logged-out) carrier picker.
  "app/carrier-picker/page.tsx",
  // Outbound mail about an integration request — leaves our screens entirely.
  "app/api/carrier-picker/connection-requests/route.ts",
]);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (/\.tsx?$/.test(entry.name)) {
      yield full;
    }
  }
}

/**
 * Files whose CODE (not prose) matches `pattern`.
 *
 * A mention inside a comment is not a use. Comments in this repository discuss
 * these rules constantly, and a guard that fired on prose would be abandoned
 * within a week.
 */
async function filesMatching(pattern) {
  const found = [];
  for await (const file of walk(WEB_ROOT)) {
    const source = await readFile(file, "utf8");
    const hit = source
      .split(/\r?\n/)
      .filter((line) => !/^\s*\*/.test(line) && !/^\s*\/\//.test(line))
      .some((line) => pattern.test(line));
    if (hit) {
      found.push(relative(WEB_ROOT, file).split(sep).join("/"));
    }
  }
  return found.sort();
}

async function callersOfMaskingHelper() {
  return filesMatching(new RegExp(`\\b${MASKING_HELPER}\\(`));
}

async function readersOfRegistry() {
  return filesMatching(/\bCARRIER_REGISTRY\b/);
}

async function readersOfMaskMap() {
  return filesMatching(/\bPROVIDER_SELLER_DISPLAY_NAMES\b/);
}

test("the fixture holds: the masking helper is still called somewhere", async () => {
  const callers = await callersOfMaskingHelper();
  assert.ok(
    callers.length > 0,
    "nobody calls the masking helper — either it is gone, or this scan is broken",
  );
});

/**
 * HALF ONE — the masking helper. Its blind spot: a name that arrived as a
 * string on a server response is printed without calling anything. See the file
 * header; that one is not closable by a scanner.
 */
test("only public screens mask a carrier name; the cabinet names it for real", async () => {
  const callers = await callersOfMaskingHelper();
  const offenders = callers.filter((file) => !PUBLIC_CALLERS.has(file));
  assert.deepEqual(
    offenders,
    [],
    "a cabinet screen is masking a carrier name — decided 18.08, the cabinet names carriers for real; if this file really is public, add it to PUBLIC_CALLERS with its reason",
  );
});

/**
 * The allow-list must not outlive its entries. A stale name in it would quietly
 * stop guarding the file it was written for, and nothing else would notice.
 */
test("every public exception on the list still calls the helper", async () => {
  const callers = new Set(await callersOfMaskingHelper());
  for (const allowed of PUBLIC_CALLERS) {
    assert.ok(
      callers.has(allowed),
      `${allowed} is on the public allow-list but no longer masks — remove it from the list`,
    );
  }
});

/**
 * THE SECOND HALF OF THE BOUNDARY, and the half that would have caught the
 * original defect.
 *
 * Watching only `providerSellerDisplayName(` misses the shape the connection
 * tab actually had until 04.09: it read `CARRIER_REGISTRY` itself and took
 * `.displayName` off the entry. That is a third source of a carrier's name,
 * reached without touching the masking helper at all — so the guard written for
 * this slice would not have caught the very defect this slice fixed.
 *
 * Reading the registry is not banned; reading it for a NAME in the cabinet is.
 * The list below is short because the rule is narrow, and it was built by
 * grepping the tree on 04.09, not from memory. Each entry says what it takes
 * from the registry: three want existence or status, one is public.
 */
const REGISTRY_READERS = new Set([
  // EXISTENCE only, for a deliberate throw: this tab is where a seller types
  // credentials, and an anonymous heading over those fields is worse than a
  // loud failure. The NAME it shows comes from carrierCabinetName.
  "lib/carriers/carrier-connections-view.ts",
  // STATUS only — `healthStatus === "discontinued"` decides whether a request
  // may be filed. Takes no name.
  "lib/carriers/request-carrier-connection.ts",
  // Outbound mail about an integration request, and the founder's copy names
  // the carrier for real on purpose. Leaves our screens entirely.
  "app/api/carrier-picker/connection-requests/route.ts",
  // The PUBLIC comparison table: filters by status and, for a key the mask map
  // does not cover, prints the registry name. That fallback is the known leak
  // recorded in ROADMAP — the guard must not pretend it is not there.
  "app/carrier-comparison/page.tsx",
]);

/**
 * HALF TWO — the registry. Its blind spot: a name that arrived as a string on a
 * server response (`RankedCarrier.displayName`) is rendered without importing
 * anything at all, and this half never sees it. See the file header.
 */
test("only these four read the registry; the cabinet takes names from one function", async () => {
  const readers = await readersOfRegistry();
  assert.ok(readers.length > 0, "nobody reads the registry — this scan is broken");

  const offenders = readers.filter((file) => !REGISTRY_READERS.has(file));
  assert.deepEqual(
    offenders,
    [],
    "a file in apps/web reads CARRIER_REGISTRY directly — in the cabinet a carrier's name comes from carrierCabinetName and nowhere else; if this file needs existence or status rather than a name, add it to REGISTRY_READERS with that reason",
  );
});

/**
 * THE LIMIT IS THE CURRENT COUNT, not a budget above it.
 *
 * Four is what the tree holds today. A limit set higher would leave a free slot:
 * a fifth reader could be added with one edit — appending to the list — and
 * nothing would say the list had grown. Sitting the limit exactly on the count
 * costs a second, deliberate edit for any addition, which is the whole point.
 *
 * Raising this number is the decision, not the workaround. If «the cabinet takes
 * a carrier's name from one function» genuinely needs a fifth exception, the
 * rule is narrower than the code and belongs restated — not padded.
 */
test("the registry allow-list has not grown past what the rule allows", () => {
  assert.equal(
    REGISTRY_READERS.size,
    4,
    "the list of files allowed to read CARRIER_REGISTRY changed — if the new one takes existence or status rather than a name, raise this number deliberately and say why; if it takes a name, it is the defect this file exists to catch",
  );
});

test("every registry exception on the list still reads it", async () => {
  const readers = new Set(await readersOfRegistry());
  for (const allowed of REGISTRY_READERS) {
    assert.ok(
      readers.has(allowed),
      `${allowed} is on the registry allow-list but no longer reads it — remove it from the list`,
    );
  }
});

/**
 * HALF THREE — the mask map itself.
 *
 * The two halves above both watch a NAME being fetched: one through the helper,
 * one off the registry. Neither sees a screen that imports
 * `PROVIDER_SELLER_DISPLAY_NAMES` and reads a masked name out of it directly —
 * no helper call, no registry. The landing page does exactly that, correctly;
 * a cabinet screen doing it would put «Перевозчик №2» back where the seller
 * needs «СДЭК», and both other halves would stay green.
 */
const MASK_MAP_READERS = new Set([
  // The landing page, and it is STRICTER than the helper on purpose: it reads
  // the map and DROPS a carrier it cannot mask, where the helper would fall
  // back to the registry's real name. On a public page that fallback is the
  // leak, so this direct read is the safe shape, not a shortcut.
  "app/(public)/page.tsx",
]);

test("only the landing reads the mask map directly", async () => {
  const readers = await readersOfMaskMap();
  assert.ok(readers.length > 0, "nobody reads the mask map — this scan is broken");

  const offenders = readers.filter((file) => !MASK_MAP_READERS.has(file));
  assert.deepEqual(
    offenders,
    [],
    "a file in apps/web reads PROVIDER_SELLER_DISPLAY_NAMES directly — in the cabinet a carrier's name comes from carrierCabinetName; on a public page use the helper, or copy the landing's drop-what-you-cannot-mask shape and add the file here with that reason",
  );
});

test("every mask-map exception on the list still reads it", async () => {
  const readers = new Set(await readersOfMaskMap());
  for (const allowed of MASK_MAP_READERS) {
    assert.ok(
      readers.has(allowed),
      `${allowed} is on the mask-map allow-list but no longer reads it — remove it from the list`,
    );
  }
});
