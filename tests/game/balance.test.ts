import { describe, expect, it } from "vitest";
import { createNewGame } from "../../src/game/engine";
import { runAiTurn } from "../../src/game/turns";

/** Small deterministic PRNG so the balance measurement is repeatable. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("balance (RD-127)", () => {
  it("lets the Politician win roughly 70% of seeded all-AI games, and every game finishes in a reasonable time", () => {
    const games = 300;
    let politicianWins = 0;
    const turns: number[] = [];
    for (let i = 1; i <= games; i += 1) {
      const random = mulberry32(i * 104_729);
      let state = createNewGame({ humanRole: "politician" });
      state = { ...state, players: state.players.map((p) => ({ ...p, controller: "ai" as const })) };
      let count = 0;
      while (state.phase !== "game-over" && count < 4_000) {
        state = runAiTurn(state, random);
        count += 1;
      }
      expect(state.phase, `game ${i} did not finish within 4000 turns`).toBe("game-over");
      turns.push(count);
      if (state.players.find((p) => p.id === state.winner)?.role === "politician") politicianWins += 1;
    }
    const share = politicianWins / games;
    // Target is 70%; the band absorbs sampling noise (about ±3 points at 300 games) but catches real drift.
    expect(share, `Politician won ${(share * 100).toFixed(1)}% of ${games} games`).toBeGreaterThanOrEqual(0.6);
    expect(share, `Politician won ${(share * 100).toFixed(1)}% of ${games} games`).toBeLessThanOrEqual(0.8);
    turns.sort((a, b) => a - b);
    expect(turns[Math.floor(turns.length / 2)], "median game length in turns").toBeLessThan(500);
  }, 120_000);
});
