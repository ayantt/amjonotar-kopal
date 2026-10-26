import { describe, expect, it } from "vitest";
import { aggregateSummaries, summarizeGame, winRate } from "../../src/game/analytics";
import { parseGameSummary } from "../../src/game/analyticsValidation";
import { createNewGame } from "../../src/game/engine";
import { simulateAiGame } from "../../src/game/simulate";
import { emptyStats, recordCashSnapshot, recordFlow } from "../../src/game/stats";

/** A finished game as the single-player UI would report it: simulated all-AI, with seat 2 relabelled as the human. */
const finished = (seed: number) => {
  const state = simulateAiGame(seed * 104_729).state;
  return { ...state, players: state.players.map((player, index) => ({ ...player, controller: index === 1 ? "human" as const : "ai" as const })) };
};

describe("stats counters", () => {
  it("ignores zero, negative and fractional amounts", () => {
    const state = createNewGame({ humanRole: "politician" });
    for (const amount of [0, -5, 1.5, Number.NaN]) {
      expect(recordFlow(state, "player-1", "in", "rent", amount)).toBe(state);
    }
  });

  it("accumulates in and out flows per player and category", () => {
    let state = createNewGame({ humanRole: "politician" });
    state = recordFlow(recordFlow(recordFlow(state, "player-1", "in", "rent", 40), "player-1", "in", "rent", 60), "player-1", "out", "tax", 100);
    expect(state.stats?.flow["player-1"]).toEqual({ in: { rent: 100 }, out: { tax: 100 } });
  });

  it("keeps at most 120 rounds of cash history", () => {
    let state = createNewGame({ humanRole: "citizen" });
    for (let round = 1; round <= 200; round += 1) state = recordCashSnapshot({ ...state, round });
    expect(state.stats?.cashHistory).toHaveLength(120);
    expect(state.stats?.cashHistory[119].round).toBe(119);
  });
});

describe("engine instrumentation", () => {
  it("records landings, cards, rent and exactly one bankruptcy entry per bankrupt player in a finished game", () => {
    const state = finished(3);
    expect(state.phase).toBe("game-over");
    const stats = state.stats ?? emptyStats();
    expect(Object.values(stats.landings).reduce((a, b) => a + b, 0)).toBeGreaterThan(100);
    expect(Object.keys(stats.cardDraws).length).toBeGreaterThan(0);
    const bankruptIds = state.players.filter((p) => p.bankrupt).map((p) => p.id).sort();
    expect(stats.bankruptcies.map((b) => b.playerId).sort()).toEqual(bankruptIds);
    expect(bankruptIds).not.toContain(state.winner);
  });

  it("is deterministic: the same seed gives the same summary", () => {
    expect(summarizeGame(finished(7), "single")).toEqual(summarizeGame(finished(7), "single"));
  });

  it("summarizes games saved before stats existed without throwing", () => {
    const { stats: _stats, ...legacy } = finished(2);
    const summary = summarizeGame(legacy, "single");
    expect(summary.players).toHaveLength(4);
    expect(summary.landings).toEqual({});
  });
});

describe("game summary privacy and validation", () => {
  it("contains no player names, ids or room data", () => {
    const state = finished(4);
    const json = JSON.stringify(summarizeGame({ ...state, players: state.players.map((p, i) => ({ ...p, name: `SecretName${i}` })) }, "online"));
    expect(json).not.toMatch(/SecretName|player-\d|room|token/i);
  });

  it("round-trips a valid summary", () => {
    const summary = summarizeGame(finished(5), "single");
    expect(parseGameSummary(JSON.parse(JSON.stringify(summary)))).toEqual(summary);
  });

  it("drops unknown fields instead of storing them", () => {
    const summary = { ...summarizeGame(finished(5), "single"), email: "a@b.c" } as unknown;
    expect(JSON.stringify(parseGameSummary(summary))).not.toContain("a@b.c");
  });

  it.each([
    ["wrong schema version", (s: Record<string, unknown>) => { s.schemaVersion = 2; }],
    ["wrong player count", (s: Record<string, unknown>) => { s.playerCount = 3; }],
    ["two politicians", (s: Record<string, unknown>) => { (s.players as Array<Record<string, unknown>>)[1].role = "politician"; }],
    ["negative flow", (s: Record<string, unknown>) => { ((s.players as Array<Record<string, unknown>>)[0].flowIn as Record<string, number>).rent = -1; }],
    ["unknown space id", (s: Record<string, unknown>) => { (s.landings as Record<string, number>)["not-a-space"] = 1; }],
    ["fractional rounds", (s: Record<string, unknown>) => { s.rounds = 2.5; }],
  ])("rejects a summary with %s", (_name, mutate) => {
    const summary = JSON.parse(JSON.stringify(summarizeGame(finished(5), "single"))) as Record<string, unknown>;
    mutate(summary);
    expect(parseGameSummary(summary)).toBeNull();
  });

  it("rejects non-objects", () => {
    for (const value of [null, undefined, 5, "x", [], true]) expect(parseGameSummary(value)).toBeNull();
  });
});

describe("aggregation", () => {
  it("computes a Wilson interval that contains the observed rate and stays within [0, 1]", () => {
    const rate = winRate(70, 100);
    expect(rate.rate).toBe(0.7);
    expect(rate.low).toBeLessThan(0.7);
    expect(rate.high).toBeGreaterThan(0.7);
    expect(winRate(0, 0).rate).toBeNull();
    expect(winRate(10, 10).high).toBeLessThanOrEqual(1);
    expect(winRate(0, 10).low).toBeGreaterThanOrEqual(0);
  });

  it("reports an empty report for no games", () => {
    const report = aggregateSummaries([]);
    expect(report.games).toBe(0);
    expect(report.politicianWinRate.rate).toBeNull();
    expect(report.rounds).toBeNull();
  });

  it("aggregates simulated games consistently", () => {
    const summaries = [1, 2, 3, 4, 5, 6].map((seed) => summarizeGame(finished(seed), "single"));
    const report = aggregateSummaries(summaries);
    expect(report.games).toBe(6);
    expect(report.byMode).toEqual({ single: 6, online: 0 });
    expect(report.politicianWinRate.games).toBe(6);
    expect(report.humanWinRateByRole.politician.games + report.humanWinRateByRole.citizen.games).toBe(6);
    for (const role of ["politician", "citizen"] as const) {
      const rate = report.bankruptRate[role];
      expect(rate === null || (rate >= 0 && rate <= 1)).toBe(true);
    }
    expect(report.spaces).toHaveLength(40);
  });
});
