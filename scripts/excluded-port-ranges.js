/**
 * WHY THIS FILE EXISTS.
 *
 * Windows hands out blocks of TCP ports to Hyper-V, WSL and Docker and then
 * REFUSES bind() on them for everybody else. Nothing is listening on such a
 * port — it is simply not available. `netstat` therefore finds no listener and
 * is formally right, and a script that reports "the port is free" on that basis
 * is telling the truth about the wrong question. Next then fails with EACCES,
 * which names no port range and no cause.
 *
 * That is the same defect this repository keeps fixing in the product: NOT
 * FOUND reported as ALL FINE. So the check is not "is anybody listening" but
 * "can we listen", and when we cannot, the answer must say why.
 *
 * PARSING IS BY NUMBERS ONLY, deliberately. `netsh` output is LOCALISED — on
 * this machine on 04.09.2026 it came back in Russian («Начальный порт»,
 * «Конечный порт») — so any parser keyed on the column titles works until the
 * system language changes. Two integers at the start of a line is the one thing
 * that is the same in every locale. Lines that do not look like that (titles,
 * the dashed rule, the footnote about managed exclusions) simply produce no
 * pair and are skipped, with no list of headings to keep up to date.
 *
 * The trailing `*` that marks a managed exclusion is ignored: it says who
 * reserved the block, and the port is equally unusable either way.
 */

/**
 * @param {string} output raw stdout of
 *   `netsh interface ipv4 show excludedportrange protocol=tcp`
 * @returns {{start: number, end: number}[]} every range it lists, in the order
 *   they appear. Unparseable input yields an empty list rather than a throw —
 *   this runs on the launch path and must never be the thing that breaks it.
 */
function parseExcludedPortRanges(output) {
  if (typeof output !== "string") {
    return [];
  }
  const ranges = [];
  for (const line of output.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    // Both must be plain digits. `/^\d+$/` and not Number(), because Number("")
    // is 0 and Number(" 12 ") is 12 — either would invent a range out of
    // whitespace.
    if (!/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) continue;
    const start = Number(parts[0]);
    const end = Number(parts[1]);
    // A reversed pair is not something netsh prints; if one ever appears it is
    // not a range we understand, and guessing at it would be worse than
    // dropping it.
    if (end < start) continue;
    ranges.push({ start, end });
  }
  return ranges;
}

/**
 * @param {{start: number, end: number}[]} ranges
 * @param {number|string} port
 * @returns {{start: number, end: number}|null} the range that swallows this
 *   port, or null. Null means "not excluded", NOT "usable" — a port can be
 *   unavailable for other reasons, and this function is not asked about those.
 */
function findRangeContaining(ranges, port) {
  const value = Number(port);
  if (!Number.isInteger(value)) {
    return null;
  }
  for (const range of ranges) {
    if (value >= range.start && value <= range.end) {
      return range;
    }
  }
  return null;
}

module.exports = { parseExcludedPortRanges, findRangeContaining };
