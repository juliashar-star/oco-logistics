import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parseExcludedPortRanges, findRangeContaining } = require(
  "../scripts/excluded-port-ranges.js",
);

/**
 * THE FIRST FIXTURE IS REAL. Captured on this machine on 04.09.2026 by running
 * `netsh interface ipv4 show excludedportrange protocol=tcp` and pasting what
 * came back, including the Russian headings, the dashed rule, the `*` on a
 * managed exclusion and the footnote. It is here because the parser's whole job
 * is surviving THIS shape, and a fixture written from memory of what netsh
 * probably prints would prove nothing.
 */
const REAL_OUTPUT_04_09 = `
Протокол tcp Диапазоны исключения портов

Начальный порт    Конечный порт
----------    --------
      5357        5357
     10673       10772
     10810       10909
     10910       11009
     11010       11109
     11110       11209
     29880       29979
     36420       36519
     50000       50059     *
     51234       51333
     51334       51433
     51440       51539

* — управляемые исключения портов.
`;

/**
 * THE SECOND FIXTURE IS RECONSTRUCTED, and saying so is the point.
 *
 * The reservation that broke the dev server this morning — 2939–3038, which
 * swallows 3000 — was GONE from the live output by the time this test was
 * written: Windows had handed out a different set of blocks. So the range is
 * the one that was observed, written into netsh's format by hand. The numbers
 * are reported; the surrounding text is not a capture.
 *
 * That is exactly why the ranges must be read at run time and never pinned: the
 * block moves between boots.
 */
const RECONSTRUCTED_MORNING_OUTPUT = `
Протокол tcp Диапазоны исключения портов

Начальный порт    Конечный порт
----------    --------
      2939        3038
     10673       10772
`;

test("today's real netsh output parses to every range it lists", () => {
  const ranges = parseExcludedPortRanges(REAL_OUTPUT_04_09);
  assert.equal(
    ranges.length,
    12,
    "headings, the dashed rule and the footnote must contribute no ranges",
  );
  assert.deepEqual(ranges[0], { start: 5357, end: 5357 });
  assert.deepEqual(ranges[6], { start: 29880, end: 29979 });
  assert.deepEqual(ranges[11], { start: 51440, end: 51539 });
});

test("the star marking a managed exclusion does not stop the line parsing", () => {
  const ranges = parseExcludedPortRanges(REAL_OUTPUT_04_09);
  assert.ok(
    ranges.some((range) => range.start === 50000 && range.end === 50059),
    "50000-50059 is printed with a trailing * and must still be read — the port is unusable either way",
  );
});

test("3000 was not excluded in today's live output", () => {
  const ranges = parseExcludedPortRanges(REAL_OUTPUT_04_09);
  assert.equal(
    findRangeContaining(ranges, 3000),
    null,
    "this pins the fixture, not the machine: the blocks move between boots",
  );
});

test("the range observed this morning does swallow 3000", () => {
  const ranges = parseExcludedPortRanges(RECONSTRUCTED_MORNING_OUTPUT);
  assert.deepEqual(findRangeContaining(ranges, 3000), { start: 2939, end: 3038 });
});

test("both ends of a range are inside it", () => {
  const ranges = [{ start: 2939, end: 3038 }];
  assert.deepEqual(findRangeContaining(ranges, 2939), { start: 2939, end: 3038 });
  assert.deepEqual(findRangeContaining(ranges, 3038), { start: 2939, end: 3038 });
  assert.equal(findRangeContaining(ranges, 2938), null);
  assert.equal(findRangeContaining(ranges, 3039), null);
});

test("a port given as a string is matched, because argv hands us strings", () => {
  const ranges = [{ start: 2939, end: 3038 }];
  assert.deepEqual(findRangeContaining(ranges, "3000"), { start: 2939, end: 3038 });
});

test("nothing usable in, empty list out — never a throw", () => {
  assert.deepEqual(parseExcludedPortRanges(""), []);
  assert.deepEqual(parseExcludedPortRanges("netsh is not recognised"), []);
  assert.deepEqual(parseExcludedPortRanges(undefined), []);
  assert.deepEqual(parseExcludedPortRanges(null), []);
});

test("whitespace and blank columns invent no ranges", () => {
  // Number("") is 0 and Number(" 12 ") is 12; a parser using Number() alone
  // would read a range out of an empty line.
  assert.deepEqual(parseExcludedPortRanges("   \n\t\n  \n"), []);
});

test("a reversed pair is dropped rather than guessed at", () => {
  assert.deepEqual(parseExcludedPortRanges("  3038   2939  "), []);
});

test("a port that is not an integer matches nothing", () => {
  const ranges = [{ start: 2939, end: 3038 }];
  assert.equal(findRangeContaining(ranges, "three thousand"), null);
  assert.equal(findRangeContaining(ranges, 3000.5), null);
  assert.equal(findRangeContaining(ranges, NaN), null);
});
