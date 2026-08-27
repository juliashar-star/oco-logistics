import assert from "node:assert/strict";
import test from "node:test";

import { preselectOffer } from "../apps/web/lib/shipments/preselect-offer.ts";
import { offerHighlights } from "../apps/web/lib/shipments/offer-highlights.ts";

/**
 * @param {string} offerId
 * @param {number} priceRub
 * @param {{ intervalTo?: string, dayTo?: string, dayFrom?: string }} [when]
 */
function offer(offerId, priceRub, when = {}) {
  return {
    offerId,
    priceRub,
    deliveryIntervalTo: when.intervalTo ?? "",
    deliveryDayTo: when.dayTo ?? "",
    deliveryDayFrom: when.dayFrom ?? "",
  };
}

// ── no rule ────────────────────────────────────────────────────────────────

test("no priority -> nothing preselected, nothing to say", () => {
  const offers = [offer("a", 100, { dayTo: "2026-09-01" }), offer("b", 200, { dayTo: "2026-09-02" })];
  assert.deepEqual(preselectOffer(offers, null), {
    offerId: null,
    reason: "no_rule",
    priority: null,
  });
  assert.deepEqual(preselectOffer(offers, undefined), {
    offerId: null,
    reason: "no_rule",
    priority: null,
  });
});

test("no_rule is returned ONLY when the priority is absent", () => {
  // The whole point of the fifth reason: every other silent case must be
  // distinguishable from «the seller has not chosen».
  const offers = [offer("a", 100, { dayTo: "2026-09-01" }), offer("b", 200)];
  const silent = [
    preselectOffer([], "CHEAPEST"),
    preselectOffer([], "FASTEST"),
    preselectOffer([offer("x", Number.NaN), offer("y", Number.NaN)], "CHEAPEST"),
    preselectOffer([offer("x", 1), offer("y", 2)], "FASTEST"),
  ];
  for (const result of silent) {
    assert.notEqual(
      result.reason,
      "no_rule",
      "a set priority must never be reported as «no priority»",
    );
  }
  assert.equal(preselectOffer(offers, null).reason, "no_rule");
  assert.equal(preselectOffer(offers, undefined).reason, "no_rule");
});

test("empty list with a priority -> not_applicable, because there is nothing to measure", () => {
  assert.deepEqual(preselectOffer([], "CHEAPEST"), {
    offerId: null,
    reason: "not_applicable",
    priority: "CHEAPEST",
  });
  assert.deepEqual(preselectOffer([], "FASTEST"), {
    offerId: null,
    reason: "not_applicable",
    priority: "FASTEST",
  });
});

// ── single ─────────────────────────────────────────────────────────────────

test("one offer -> preselected, and reported as single rather than as a rule", () => {
  // offerHighlights returns an empty map below two offers, so there is no tag
  // to read: the branch exists for exactly this case. Reported as `single`
  // because no comparison happened, so no comparative claim may be made.
  const one = [offer("only", 500, { dayTo: "2026-09-01" })];
  assert.deepEqual(preselectOffer(one, "CHEAPEST"), {
    offerId: "only",
    reason: "single",
    priority: "CHEAPEST",
  });
  assert.deepEqual(preselectOffer(one, "FASTEST"), {
    offerId: "only",
    reason: "single",
    priority: "FASTEST",
  });
});

// ── CHEAPEST ───────────────────────────────────────────────────────────────

test("CHEAPEST with one minimum -> that offer", () => {
  const offers = [
    offer("cheap", 100, { dayTo: "2026-09-03" }),
    offer("mid", 200, { dayTo: "2026-09-01" }),
    offer("dear", 300, { dayTo: "2026-09-02" }),
  ];
  assert.deepEqual(preselectOffer(offers, "CHEAPEST"), {
    offerId: "cheap",
    reason: "rule",
    priority: "CHEAPEST",
  });
});

test("CHEAPEST with two at the same minimum -> nothing, reported as a tie", () => {
  const offers = [
    offer("a", 100, { dayTo: "2026-09-03" }),
    offer("b", 100, { dayTo: "2026-09-01" }),
    offer("c", 300, { dayTo: "2026-09-02" }),
  ];
  assert.deepEqual(preselectOffer(offers, "CHEAPEST"), {
    offerId: null,
    reason: "tie",
    priority: "CHEAPEST",
  });
});

// ── FASTEST ────────────────────────────────────────────────────────────────

test("FASTEST with one earliest deadline -> that offer", () => {
  const offers = [
    offer("slow", 100, { dayTo: "2026-09-05" }),
    offer("quick", 300, { dayTo: "2026-09-01" }),
  ];
  assert.deepEqual(preselectOffer(offers, "FASTEST"), {
    offerId: "quick",
    reason: "rule",
    priority: "FASTEST",
  });
});

test("FASTEST with two sharing the earliest deadline -> nothing, reported as a tie", () => {
  const offers = [
    offer("a", 100, { dayTo: "2026-09-01" }),
    offer("b", 300, { dayTo: "2026-09-01" }),
    offer("c", 200, { dayTo: "2026-09-05" }),
  ];
  assert.deepEqual(preselectOffer(offers, "FASTEST"), {
    offerId: null,
    reason: "tie",
    priority: "FASTEST",
  });
});

test("FASTEST does not break the tie by price, which is what the badge refuses too", () => {
  const offers = [
    offer("dearer-but-same-day", 900, { dayTo: "2026-09-01" }),
    offer("cheaper-same-day", 100, { dayTo: "2026-09-01" }),
  ];
  assert.equal(preselectOffer(offers, "FASTEST").offerId, null);
});

// ── unusable inputs ────────────────────────────────────────────────────────

test("an offer with a non-finite price never wins CHEAPEST", () => {
  const offers = [
    offer("broken", Number.NaN, { dayTo: "2026-09-01" }),
    offer("real", 500, { dayTo: "2026-09-02" }),
  ];
  assert.deepEqual(preselectOffer(offers, "CHEAPEST"), {
    offerId: "real",
    reason: "rule",
    priority: "CHEAPEST",
  });
});

test("FASTEST with no usable deadline anywhere -> not_applicable, not a tie", () => {
  // Nothing to tie, and «несколько вариантов приезжают одинаково быстро» about
  // a list where no offer names a day or an interval would be false.
  const offers = [offer("a", 100), offer("b", 200)];
  assert.deepEqual(preselectOffer(offers, "FASTEST"), {
    offerId: null,
    reason: "not_applicable",
    priority: "FASTEST",
  });
});

test("CHEAPEST with every price non-finite -> not_applicable, not a tie", () => {
  const offers = [
    offer("a", Number.NaN, { dayTo: "2026-09-01" }),
    offer("b", Number.POSITIVE_INFINITY, { dayTo: "2026-09-02" }),
  ];
  assert.deepEqual(preselectOffer(offers, "CHEAPEST"), {
    offerId: null,
    reason: "not_applicable",
    priority: "CHEAPEST",
  });
});

// ── the drift guard ────────────────────────────────────────────────────────

/**
 * MEMBERSHIP, NOT RECOMPUTATION. This asserts the preselected id is IN the set
 * the screen badges, by reading offerHighlights. Recomputing a minimum price or
 * a deadline here and comparing would be f(x) versus f(x): both sides would move
 * together and the drift this exists to catch would pass unseen.
 */
test("a preselected offer is always a member of the badge set for its criterion", () => {
  const cases = [
    [
      offer("a", 100, { dayTo: "2026-09-03" }),
      offer("b", 200, { dayTo: "2026-09-01" }),
      offer("c", 300, { dayTo: "2026-09-02" }),
    ],
    [
      offer("x", 250, { intervalTo: "2026-09-01T10:00:00Z" }),
      offer("y", 250, { intervalTo: "2026-09-01T18:00:00Z" }),
      offer("z", 900, { intervalTo: "2026-09-01T09:00:00Z" }),
    ],
    [
      offer("m", 10, { dayTo: "2026-09-04" }),
      offer("n", 20, { dayTo: "2026-09-04" }),
      offer("o", 30, { dayTo: "2026-09-09" }),
    ],
    // ONLY deliveryDayFrom — the CDEK-shaped row the fallback exists for.
    // Neither of the cases above exercises it, which is how the dropped field
    // went unnoticed.
    [
      offer("p", 700, { dayFrom: "2026-09-02" }),
      offer("q", 100, { dayFrom: "2026-09-08" }),
      offer("r", 400, { dayFrom: "2026-09-08" }),
    ],
    // Mixed: one row with only the early edge beside rows with the late one.
    [
      offer("s", 300, { dayFrom: "2026-09-01" }),
      offer("t", 200, { dayTo: "2026-09-06" }),
    ],
  ];

  for (const offers of cases) {
    for (const [priority, tag] of [
      ["CHEAPEST", "cheaper"],
      ["FASTEST", "faster"],
    ]) {
      const result = preselectOffer(offers, priority);
      if (result.reason !== "rule") {
        continue;
      }
      const tags = offerHighlights(offers);
      assert.ok(
        (tags.get(result.offerId) ?? []).includes(tag),
        `${priority}: preselected ${result.offerId} is not in the «${tag}» set`,
      );
    }
  }
});

test("when the rule preselects, it never picks an offer the screen does not badge", () => {
  // The converse of the guard above, stated on a list where both criteria have
  // a single winner and they are DIFFERENT offers.
  const offers = [
    offer("cheapest", 100, { dayTo: "2026-09-09" }),
    offer("fastest", 800, { dayTo: "2026-09-01" }),
    offer("neither", 400, { dayTo: "2026-09-05" }),
  ];
  const tags = offerHighlights(offers);

  const cheap = preselectOffer(offers, "CHEAPEST");
  assert.equal(cheap.reason, "rule");
  assert.ok((tags.get(cheap.offerId) ?? []).includes("cheaper"));

  const fast = preselectOffer(offers, "FASTEST");
  assert.equal(fast.reason, "rule");
  assert.ok((tags.get(fast.offerId) ?? []).includes("faster"));

  assert.notEqual(cheap.offerId, fast.offerId);
});

test("a missing day field is read as absent, the same way the DTO writes it", () => {
  // CarrierOffer leaves the day fields optional; the DTO turns them into "".
  // The rule normalises identically, so both reason about the same values.
  const withUndefined = [
    { offerId: "a", priceRub: 100, deliveryDayTo: "2026-09-01" },
    { offerId: "b", priceRub: 200 },
  ];
  const withEmptyStrings = [
    offer("a", 100, { dayTo: "2026-09-01" }),
    offer("b", 200),
  ];
  assert.deepEqual(
    preselectOffer(withUndefined, "FASTEST"),
    preselectOffer(withEmptyStrings, "FASTEST"),
  );
  assert.deepEqual(preselectOffer(withUndefined, "FASTEST"), {
    offerId: "a",
    reason: "rule",
    priority: "FASTEST",
  });
});

// ── the CDEK shape: only an early edge ──────────────────────────────────────
// comparableOfferDeadlines falls back to deliveryDayFrom when deliveryDayTo is
// blank, and CDEK produces exactly that. A rule that built its input from a
// narrower field list would drop the fallback and answer not_applicable while
// the screen tagged «быстрее» — a second definition of «sooner», entering
// through the input instead of the comparison.

test("FASTEST on rows carrying ONLY deliveryDayFrom agrees with what the screen badges", () => {
  const offers = [
    offer("early", 900, { dayFrom: "2026-09-02" }),
    offer("late-a", 100, { dayFrom: "2026-09-08" }),
    offer("late-b", 200, { dayFrom: "2026-09-08" }),
  ];

  const result = preselectOffer(offers, "FASTEST");
  assert.deepEqual(
    result,
    { offerId: "early", reason: "rule", priority: "FASTEST" },
    "the early-edge fallback must produce a usable deadline",
  );

  const tags = offerHighlights(offers);
  assert.ok(
    (tags.get("early") ?? []).includes("faster"),
    "the screen must tag the same offer the rule preselected",
  );
});

test("a blank deliveryDayTo beside a set deliveryDayFrom is not «no deadline»", () => {
  // The regression this guards: dropping the field made every such row
  // deadline-less, so the whole list looked unmeasurable.
  const offers = [
    offer("a", 100, { dayTo: "", dayFrom: "2026-09-03" }),
    offer("b", 200, { dayTo: "", dayFrom: "2026-09-04" }),
  ];
  assert.notEqual(
    preselectOffer(offers, "FASTEST").reason,
    "not_applicable",
    "rows with only an early edge do carry a deadline",
  );
  assert.deepEqual(preselectOffer(offers, "FASTEST"), {
    offerId: "a",
    reason: "rule",
    priority: "FASTEST",
  });
});
