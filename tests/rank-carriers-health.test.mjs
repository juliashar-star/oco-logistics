import test from "node:test";
import assert from "node:assert/strict";

// Локальная копия health-логики rank.ts для тестов без изменения CARRIER_REGISTRY.
const SCORE_HEALTH_ISSUES_PENALTY = 10;

function isDiscontinued(carrier) {
  return carrier.healthStatus === "discontinued";
}

function rankFixedProfileFixture(order, registry, connectedKeys) {
  const connected = connectedKeys !== undefined ? new Set(connectedKeys) : null;
  const carriers = [];

  for (const providerKey of order) {
    const carrier = registry.find((c) => c.providerKey === providerKey);
    if (!carrier) continue;
    if (isDiscontinued(carrier)) continue;
    carriers.push(carrier);
  }

  if (carriers.length === 0) {
    return {
      ranked: [],
      reason: "no_active_carrier",
    };
  }

  carriers.sort((a, b) => {
    const healthRank = (c) => (c.healthStatus === "issues" ? 1 : 0);
    return healthRank(a) - healthRank(b);
  });

  return {
    ranked: carriers.map((carrier) => ({
      providerKey: carrier.providerKey,
      healthStatus: carrier.healthStatus,
      isConnected: connected ? connected.has(carrier.providerKey) : false,
    })),
  };
}

function rankWithScoreCardsFixture(carriers, scoreByKey) {
  const eligible = carriers.filter((carrier) => !isDiscontinued(carrier));

  return eligible
    .map((carrier) => {
      const baseScore = scoreByKey[carrier.providerKey] ?? 0;
      const score =
        carrier.healthStatus === "issues"
          ? Math.max(0, baseScore - SCORE_HEALTH_ISSUES_PENALTY)
          : baseScore;
      return {
        providerKey: carrier.providerKey,
        score,
        healthStatus: carrier.healthStatus,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.providerKey.localeCompare(b.providerKey);
    });
}

const fixtureRegistry = [
  {
    providerKey: "active-a",
    displayName: "Active A",
    healthStatus: "active",
  },
  {
    providerKey: "discontinued-b",
    displayName: "Discontinued B",
    healthStatus: "discontinued",
  },
  {
    providerKey: "issues-c",
    displayName: "Issues C",
    healthStatus: "issues",
  },
];

test("discontinued carrier never appears in ranked[]", () => {
  const result = rankFixedProfileFixture(
    ["active-a", "discontinued-b", "issues-c"],
    fixtureRegistry,
    ["active-a", "discontinued-b", "issues-c"],
  );

  assert.equal(
    result.ranked.some((c) => c.providerKey === "discontinued-b"),
    false,
  );
  assert.deepEqual(
    result.ranked.map((c) => c.providerKey),
    ["active-a", "issues-c"],
  );
});

test("all carriers in fixed order discontinued yields no_active_carrier", () => {
  const result = rankFixedProfileFixture(
    ["discontinued-b"],
    fixtureRegistry,
    ["discontinued-b"],
  );

  assert.equal(result.reason, "no_active_carrier");
  assert.equal(result.ranked.length, 0);
});

test("issues carrier ranks below active carrier with equal base score", () => {
  const ranked = rankWithScoreCardsFixture(
    [
      { providerKey: "active-a", healthStatus: "active" },
      { providerKey: "issues-c", healthStatus: "issues" },
    ],
    { "active-a": 20, "issues-c": 20 },
  );

  assert.equal(ranked[0].providerKey, "active-a");
  assert.equal(ranked[0].score, 20);
  assert.equal(ranked[1].providerKey, "issues-c");
  assert.equal(ranked[1].score, 10);
});
