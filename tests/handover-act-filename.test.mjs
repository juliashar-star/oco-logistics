import assert from "node:assert/strict";
import test from "node:test";

import { handoverActFilename } from "../apps/web/lib/shipments/handover-act-filename.ts";

test("known Moscow daytime produces the exact expected filename", () => {
  // 12:00 in Moscow on 2026-07-30.
  const date = new Date("2026-07-30T09:00:00.000Z");
  assert.equal(handoverActFilename(date), "handover-act-2026-07-30.pdf");
});

test("filename contains no personal data — only fixed prefix, calendar day, .pdf", () => {
  const name = handoverActFilename(new Date("2026-07-30T09:00:00.000Z"));
  assert.match(name, /^handover-act-\d{4}-\d{2}-\d{2}\.pdf$/);
  assert.equal(name.includes("@"), false);
  assert.equal(name.includes("+"), false);
  assert.equal(/[а-яА-ЯёЁ]/.test(name), false);
  assert.equal(name.includes("ship-"), false);
  assert.equal(name.includes("oco-"), false);
  assert.equal(name.includes("udp"), false);
});
